/** Export, delete (two-step with token) and doctor (ARCHITECTURE §5 F7/F8, §10.4). */
import path from 'node:path';
import { MentorError } from '../core/errors.js';
import { parseQualifiedId, randomToken, assertSlug } from '../core/ids.js';
import { heading, levelLabel } from '../core/labels.js';
import { atomicWrite, countFiles, exists } from '../storage/fsx.js';
import { parseDoc } from '../storage/markdown.js';
import { DIRS, rel } from '../storage/root.js';
import {
  ConfigSchema,
  DATA_SCHEMA,
  PreferencesSchema,
  ProfileSchema,
  SCHEMAS_BY_KIND,
  SourceSchema,
  SubjectPathSchema,
  SubjectSchema,
  TopicPathSchema,
  TopicSchema,
  type DocKind,
  type JournalEvent,
  type Topic,
} from '../schema/index.js';
import {
  VERSION,
  emptyTopicDoc,
  labelLang,
  loadPaths,
  loadSubjects,
  loadTopics,
  makeEvents,
  projectTopic,
  renderTopicServerSections,
  today,
  topicHistory,
  type Ctx,
} from './context.js';
import type { Mentor } from './mentor.js';
import { newDoc, setSection } from '../storage/markdown.js';

export type DeleteScope = 'topic' | 'subject' | 'research' | 'all';

interface PendingDelete {
  scope: DeleteScope;
  target: string | null;
  purge: boolean;
  expires: number;
}

const TOKEN_TTL_MS = 10 * 60 * 1000;

export class DataOps {
  private readonly pending = new Map<string, PendingDelete>();

  constructor(
    private readonly ctx: Ctx,
    private readonly mentor: Mentor,
  ) {}

  private get store() {
    return this.ctx.store;
  }

  // ================================================================== export

  async exportData(input: { snapshot?: boolean }): Promise<Record<string, unknown>> {
    await this.store.assertInitialized();
    const now = this.ctx.clock.now();
    const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    // Deliberate exception to "write only inside the root": the export goes next to it.
    const dest = path.join(path.dirname(this.store.root), `${path.basename(this.store.root)}-export-${stamp}`);
    if (await exists(dest)) throw new MentorError('E_CONFLICT', `Export folder already exists: ${dest}`);
    const files = await this.store.copyRootTo(dest);
    let snapshotPath: string | null = null;
    if (input.snapshot) {
      snapshotPath = path.join(dest, 'learner-snapshot.md');
      await atomicWrite(snapshotPath, await this.snapshot());
    }
    await this.store.journal.append(makeEvents(this.ctx, [{ type: 'export', data: { destination: dest, snapshot: !!input.snapshot, files } }]));
    return { export_path: dest, files, snapshot_path: snapshotPath };
  }

  /** One Markdown file summarising the learner, for a claude.ai Project. */
  async snapshot(): Promise<string> {
    const config = await this.store.readConfig();
    const lang = labelLang(config);
    const [topics, subjects, paths] = await Promise.all([loadTopics(this.ctx), loadSubjects(this.ctx), loadPaths(this.ctx)]);
    const profile = await this.store.readDoc(rel.profile(), ProfileSchema).catch(() => null);
    const out: string[] = [`# Learner snapshot (${today(this.ctx)})`, '', 'Exported by the Learning Mentor plugin. Read-only summary.', ''];
    if (profile?.data.goals.length) out.push('## Goals', ...profile.data.goals.map((g) => `- ${g}`), '');
    for (const s of subjects.items) {
      out.push(`## ${s.data.title} (\`${s.data.id}\`)`);
      if (s.data.goal) out.push(`Goal: ${s.data.goal}`);
      out.push('', '| Topic | Level | Review due | Open misconceptions |', '|---|---|---|---|');
      for (const t of topics.items.map((x) => x.data).filter((t) => t.subject === s.data.id)) {
        const misc = t.misconceptions.filter((m) => m.status !== 'resolved').map((m) => `${m.id}: ${m.description}`).join('; ');
        out.push(`| ${t.title} | ${t.level ?? '–'} ${levelLabel(lang, t.level, { provisional: t.provisional })} | ${t.review?.due ?? '—'} | ${misc || '—'} |`);
      }
      const sp = paths.subjectPaths.items.find((p) => p.data.subject === s.data.id);
      if (sp) out.push('', `Path: ${sp.data.topics.map((n) => n.id.split('/')[1]).join(' → ')}`);
      for (const tp of paths.topicPaths.items.filter((p) => p.data.topic.startsWith(`${s.data.id}/`))) {
        const active = tp.data.stages.find((st) => st.status === 'active');
        if (active) out.push(`Current stage in ${tp.data.topic}: ${active.title} — ${active.goal}`);
      }
      out.push('');
    }
    return out.join('\n');
  }

  // ================================================================== delete

  private async targetsFor(scope: DeleteScope, target: string | null): Promise<string[]> {
    switch (scope) {
      case 'topic': {
        const { subject, slug } = parseQualifiedId('topic', target ?? '');
        return [rel.topic(subject, slug), rel.topicPath(subject, slug)];
      }
      case 'subject': {
        const s = assertSlug('subject', target ?? '');
        return [`${DIRS.knowledge}/${s}`, `${DIRS.paths}/${s}`, `${DIRS.research}/${s}`, rel.subject(s)];
      }
      case 'research':
        return target ? [`${DIRS.research}/${assertSlug('subject', target)}`] : [DIRS.research];
      case 'all':
        return [DIRS.profile, DIRS.knowledge, DIRS.paths, DIRS.research];
    }
  }

  private journalMatcher(scope: DeleteScope, target: string | null): (e: JournalEvent) => boolean {
    switch (scope) {
      case 'topic':
        return (e) => e.topic === target;
      case 'subject':
        return (e) => e.subject === target || (typeof e.topic === 'string' && e.topic.startsWith(`${target}/`));
      case 'research':
        return (e) => e.type === 'source_saved' && (!target || e.subject === target);
      case 'all':
        return () => true;
    }
  }

  async deleteData(input: { scope: DeleteScope; target?: string; purge?: boolean; confirmation_token?: string }): Promise<Record<string, unknown>> {
    await this.store.assertInitialized();
    const target = input.target ?? null;
    const purge = !!input.purge;
    if ((input.scope === 'topic' || input.scope === 'subject') && !target) throw new MentorError('E_INVALID_INPUT', `scope "${input.scope}" needs a target.`);
    const targets = await this.targetsFor(input.scope, target);
    const now = this.ctx.clock.now();

    if (!input.confirmation_token) {
      let files = 0;
      for (const t of targets) files += (await exists(this.store.abs(t))) ? Math.max(1, await countFiles(this.store.abs(t))) : 0;
      if (input.scope === 'topic' && files === 0) throw new MentorError('E_NOT_FOUND', `Nothing to delete for topic ${target}.`);
      const { events } = await this.store.journal.readAll();
      const journalEvents = events.filter(this.journalMatcher(input.scope, target)).length;
      for (const [k, v] of this.pending) if (v.expires < now.getTime()) this.pending.delete(k);
      const token = randomToken();
      this.pending.set(token, { scope: input.scope, target, purge, expires: now.getTime() + TOKEN_TTL_MS });
      throw new MentorError(
        'E_CONFIRMATION_REQUIRED',
        `This would ${purge ? 'PERMANENTLY delete' : 'move to trash (kept 30 days)'} ${files} file(s)` +
          `${purge ? ` and ${journalEvents} journal event(s)` : ''} for ${input.scope}${target ? ` "${target}"` : ''}` +
          `${input.scope === 'all' && purge ? ', including settings and the whole data folder' : ''}. ` +
          `Show this to the learner and ask for explicit confirmation. If they confirm, call mentor_delete again with the same arguments and confirmation_token "${token}" (valid 10 minutes).`,
        { token, files, journal_events: journalEvents, purge },
      );
    }

    const pending = this.pending.get(input.confirmation_token);
    if (!pending || pending.expires < now.getTime() || pending.scope !== input.scope || pending.target !== target || pending.purge !== purge) {
      throw new MentorError('E_CONFIRMATION_INVALID', 'The confirmation token is invalid, expired or was issued for different arguments. Start again without a token.');
    }
    this.pending.delete(input.confirmation_token);

    return this.store.lock(async () => {
      if (purge && input.scope === 'all') {
        const root = this.store.root;
        const entries = [DIRS.profile, DIRS.knowledge, DIRS.paths, DIRS.research, DIRS.meta, rel.readme()];
        for (const e of entries) await this.store.remove(e);
        return { deleted: 'all', purge: true, root, note: 'All learning data was permanently removed. Run /learning-mentor:start to begin again.' };
      }
      let movedTo: string | null = null;
      let removedEvents = 0;
      if (purge) {
        for (const t of targets) await this.store.remove(t);
        removedEvents = await this.store.journal.remove(this.journalMatcher(input.scope, target));
        // Also purge any copies in trash and backups for this scope.
        await this.purgeCopies(targets);
      } else {
        movedTo = await this.store.moveAside(targets, 'trash', now);
      }
      // A "delete" event is also the tombstone that stops replay and doctor from resurrecting
      // trashed items; after a purge the events are gone, so a "purge" record is enough.
      await this.store.journal.append(makeEvents(this.ctx, [{ type: purge ? 'purge' : 'delete', data: { scope: input.scope, target, removed_events: removedEvents } }]));
      if (input.scope === 'topic' && target) await this.detachTopic(target);
      if (input.scope === 'all') await this.mentor.init({});
      return { deleted: input.scope, target, purge, trash: movedTo, removed_journal_events: removedEvents };
    });
  }

  private async purgeCopies(targets: string[]): Promise<void> {
    for (const area of [DIRS.trash, DIRS.backups]) {
      for (const dir of await this.store.listSubjectsIn(area)) {
        for (const t of targets) await this.store.remove(`${area}/${dir}/${t}`);
      }
    }
  }

  /** Removes a deleted topic from its subject path and from other topics' prerequisites. */
  private async detachTopic(topicId: string): Promise<void> {
    const { subject } = parseQualifiedId('topic', topicId);
    const sp = await this.store.readDoc(rel.subjectPath(subject), SubjectPathSchema).catch(() => null);
    if (sp) {
      sp.data.topics = sp.data.topics.filter((n) => n.id !== topicId).map((n) => ({ ...n, prerequisites: n.prerequisites.filter((p) => p !== topicId) }));
      await this.store.writeDoc(rel.subjectPath(subject), SubjectPathSchema, sp.data, sp.doc);
    }
    const topics = await loadTopics(this.ctx);
    for (const t of topics.items) {
      if (!t.data.prerequisites.includes(topicId)) continue;
      const { subject: s, slug } = parseQualifiedId('topic', t.data.id);
      await this.store.writeDoc(rel.topic(s, slug), TopicSchema, { ...t.data, prerequisites: t.data.prerequisites.filter((p) => p !== topicId) }, t.doc);
    }
    await this.mentor.refreshSubjectOverview(subject);
    await this.mentor.refreshSubjectPathOverview(subject);
  }

  // ================================================================== doctor

  async doctor(input: { repair?: boolean }): Promise<Record<string, unknown>> {
    await this.store.assertInitialized();
    const repair = !!input.repair;
    const now = this.ctx.clock.now();
    return this.store.lock(async () => {
      const problems: { path: string; problem: string; action: string }[] = [];
      let checked = 0;
      const { events, badLines, oversized } = await this.store.journal.readAll();
      for (const f of oversized) {
        problems.push({ path: `${DIRS.journal}/${f}`, problem: 'journal file is too large to load and was skipped', action: 'move it aside manually after checking it' });
      }
      for (const dir of [DIRS.profile, DIRS.subjects, DIRS.knowledge, DIRS.paths, DIRS.research]) {
        let n = await this.store.countUnexpected(dir);
        for (const s of await this.store.listSubjectsIn(dir)) if (dir !== DIRS.profile && dir !== DIRS.subjects) n += await this.store.countUnexpected(`${dir}/${s}`);
        if (n) problems.push({ path: dir, problem: `${n} file(s) with unexpected names are ignored (names are not shown)`, action: 'none; rename to kebab-case or remove them' });
      }
      if (badLines.length) {
        problems.push({ path: DIRS.journal, problem: `${badLines.length} unreadable journal line(s): ${badLines.slice(0, 5).map((b) => `${b.file}:${b.line}`).join(', ')}`, action: 'ignored when reading' });
      }

      // Config.
      try {
        await this.store.readConfig();
      } catch (e) {
        if (!(e instanceof MentorError) || e.code !== 'E_CORRUPT') throw e;
        problems.push({ path: rel.config(), problem: e.message, action: repair ? 'quarantined; defaults written' : 'run with repair: true' });
        if (repair) {
          await this.store.moveAside([rel.config()], 'quarantine', now);
          await this.store.writeConfig(ConfigSchema.parse({}));
        }
      }

      // Every markdown document under the four folders.
      const docs: { relPath: string; kind: DocKind }[] = [
        { relPath: rel.profile(), kind: 'profile' },
        { relPath: rel.preferences(), kind: 'preferences' },
      ];
      for (const p of await this.store.listDocs(DIRS.subjects)) docs.push({ relPath: p, kind: 'subject' });
      for (const s of await this.store.listSubjectsIn(DIRS.knowledge)) for (const p of await this.store.listDocs(`${DIRS.knowledge}/${s}`)) docs.push({ relPath: p, kind: 'topic' });
      for (const s of await this.store.listSubjectsIn(DIRS.paths)) {
        for (const p of await this.store.listDocs(`${DIRS.paths}/${s}`)) docs.push({ relPath: p, kind: p.endsWith('/_path.md') ? 'subject_path' : 'topic_path' });
      }
      for (const s of await this.store.listSubjectsIn(DIRS.research)) for (const p of await this.store.listDocs(`${DIRS.research}/${s}`)) docs.push({ relPath: p, kind: 'source' });

      for (const d of docs) {
        checked++;
        try {
          const loaded = await this.store.readDoc(d.relPath, SCHEMAS_BY_KIND[d.kind]);
          if (!loaded) {
            if (d.kind === 'profile' || d.kind === 'preferences') {
              problems.push({ path: d.relPath, problem: 'missing', action: repair ? 'recreated' : 'run with repair: true' });
            }
            continue;
          }
          if (d.kind === 'topic') {
            // Check that derived fields agree with the journal.
            const t = loaded.data as Topic;
            const config = await this.store.readConfig();
            const projected = projectTopic(t, topicHistory(events, t.id), config);
            if (projected.level !== t.level || JSON.stringify(projected.review) !== JSON.stringify(t.review)) {
              problems.push({ path: d.relPath, problem: 'level or review out of sync with the journal', action: repair ? 'recomputed' : 'run with repair: true' });
              if (repair) {
                const { events: all } = await this.store.journal.readAll();
                renderTopicServerSections(loaded.doc, projected, topicHistory(all, t.id).evidence, labelLang(config));
                await this.store.writeDoc(d.relPath, TopicSchema, projected, loaded.doc);
              }
            }
          }
        } catch (e) {
          if (!(e instanceof MentorError)) throw e;
          if (e.code === 'E_SCHEMA_TOO_NEW') {
            problems.push({ path: d.relPath, problem: e.message, action: 'left unchanged (update the plugin)' });
            continue;
          }
          const action = repair ? await this.repairDoc(d.relPath, d.kind, events, now) : 'run with repair: true';
          problems.push({ path: d.relPath, problem: e.message, action });
        }
      }

      // Topics known to the journal but missing on disk (not deleted).
      const knownTopics = new Set(events.filter((e) => e.type === 'topic_created' && e.topic).map((e) => e.topic!));
      for (const id of knownTopics) {
        const { subject, slug } = parseQualifiedId('topic', id);
        const h = topicHistory(events, id);
        if (!h.meta) continue; // deleted (no events after the tombstone)
        if (await this.store.exists(rel.topic(subject, slug))) continue;
        checked++;
        const action = repair ? await this.rebuildTopic(subject, slug, events) : 'run with repair: true';
        problems.push({ path: rel.topic(subject, slug), problem: 'missing but recorded in the journal', action });
      }

      if (repair) {
        for (const [relPath, schema, kind] of [
          [rel.profile(), ProfileSchema, 'profile'],
          [rel.preferences(), PreferencesSchema, 'preferences'],
        ] as const) {
          if (!(await this.store.exists(relPath))) await this.rebuildFromSnapshot(relPath, kind, schema, events);
        }
        await this.store.writeMeta({ data_schema: DATA_SCHEMA, created: (await this.store.readMeta())?.created ?? now.toISOString(), plugin_version_last_write: VERSION });
        if (problems.length) await this.store.journal.append(makeEvents(this.ctx, [{ type: 'repair', data: { problems: problems.length } }]));
      }
      const trashPruned = repair ? await this.store.pruneTrash(now) : 0;
      return { checked, ok: problems.length === 0, problems, repaired: repair, trash_pruned: trashPruned };
    });
  }

  private async repairDoc(relPath: string, kind: DocKind, events: JournalEvent[], now: Date): Promise<string> {
    const backup = await this.store.moveAside([relPath], 'quarantine', now);
    if (kind === 'topic') {
      const [, subject, file] = relPath.split('/');
      const rebuilt = await this.rebuildTopic(subject!, file!.replace(/\.md$/, ''), events);
      return `quarantined to ${backup}; ${rebuilt}`;
    }
    const schema = SCHEMAS_BY_KIND[kind];
    const ok = await this.rebuildFromSnapshot(relPath, kind, schema, events);
    return `quarantined to ${backup}; ${ok ? 'rebuilt from the last journal snapshot' : 'no snapshot in the journal — recreate it (e.g. plan the path again)'}`;
  }

  private async rebuildTopic(subject: string, slug: string, events: JournalEvent[]): Promise<string> {
    const id = `${subject}/${slug}`;
    const history = topicHistory(events, id);
    const config = await this.store.readConfig();
    const lang = labelLang(config);
    const day = today(this.ctx);
    const meta = history.meta ?? {};
    const base = TopicSchema.parse({
      schema: DATA_SCHEMA,
      kind: 'topic',
      id,
      subject,
      title: meta.title ?? slug,
      aliases: meta.aliases ?? [],
      prerequisites: meta.prerequisites ?? [],
      created: meta.created ?? day,
      updated: day,
    });
    const topic = projectTopic(base, history, config);
    const doc = emptyTopicDoc(topic, lang);
    renderTopicServerSections(doc, topic, history.evidence, lang);
    setSection(doc, 'notes', heading(lang, 'notes'), lang === 'ru' ? 'Восстановлено из журнала; текстовые разделы были утеряны.' : 'Rebuilt from the journal; free-text sections were lost.');
    await this.store.writeDoc(rel.topic(subject, slug), TopicSchema, topic, doc);
    return `rebuilt from ${history.evidence.length} journal evidence event(s)`;
  }

  private async rebuildFromSnapshot(relPath: string, kind: DocKind, schema: (typeof SCHEMAS_BY_KIND)[DocKind], events: JournalEvent[]): Promise<boolean> {
    const lang = labelLang(await this.store.readConfig());
    const day = today(this.ctx);
    const matches = (e: JournalEvent): boolean => {
      const snap = e.data.snapshot as Record<string, unknown> | undefined;
      if (!snap || snap.kind !== kind) return false;
      if (kind === 'subject') return relPath === rel.subject(String(snap.id));
      if (kind === 'subject_path') return relPath === rel.subjectPath(String(snap.subject));
      if (kind === 'topic_path') {
        const { subject, slug } = parseQualifiedId('topic', String(snap.topic));
        return relPath === rel.topicPath(subject, slug);
      }
      if (kind === 'source') {
        const { subject, slug } = parseQualifiedId('source', String(snap.id));
        return relPath === rel.source(subject, slug);
      }
      return true;
    };
    const last = [...events].reverse().find(matches);
    let data: unknown = last?.data.snapshot;
    if (!data && (kind === 'profile' || kind === 'preferences')) {
      data = kind === 'profile' ? { schema: DATA_SCHEMA, kind, created: day, updated: day } : { schema: DATA_SCHEMA, kind, updated: day };
    }
    if (!data) return false;
    const parsed = (schema as typeof ProfileSchema).safeParse(data);
    if (!parsed.success) return false;
    const doc = newDoc(parsed.data);
    setSection(doc, 'notes', heading(lang, 'notes'), '');
    await this.store.writeDoc(relPath, schema as typeof ProfileSchema, parsed.data, doc);
    if (kind === 'subject_path') await this.mentor.refreshSubjectPathOverview(String((parsed.data as Record<string, unknown>).subject));
    return true;
  }
}

// Re-exported for tests that need to parse raw documents.
export { parseDoc, SourceSchema, SubjectSchema, TopicPathSchema };
