/**
 * Learning Mentor use cases. One method per MCP tool (ARCHITECTURE §9).
 * Every write: validate → lock → journal (commit point) → files → unlock.
 */
import { MentorError } from '../core/errors.js';
import { isoWithOffset, localDay, type Clock } from '../core/clock.js';
import { assertSlug, parseQualifiedId, qualifiedId } from '../core/ids.js';
import { heading, levelLabel, toLabelLanguage, type Level } from '../core/labels.js';
import {
  ConfigSchema,
  DATA_SCHEMA,
  PreferencesSchema,
  ProfileSchema,
  SourceSchema,
  StageSchema,
  SubjectPathSchema,
  SubjectSchema,
  TopicPathSchema,
  TopicSchema,
  type Config,
  type EvidenceData,
  type Preferences,
  type Profile,
  type Source,
  type Stage,
  type Subject,
  type SubjectPath,
  type Topic,
  type TopicPath,
} from '../schema/index.js';
import { buildCard } from '../engine/card.js';
import { freshness } from '../engine/freshness.js';
import { assertTransition, topologicalOrder, unmetCriteria } from '../engine/paths.js';
import { recommend } from '../engine/recommender.js';
import { searchTopics } from '../engine/search.js';
import { appendToSection, getSection, newDoc, setSection } from '../storage/markdown.js';
import { DIRS, isInside, realOrResolved, rel } from '../storage/root.js';
import { Store } from '../storage/store.js';
import {
  VERSION,
  assertNoSecrets,
  emptyTopicDoc,
  labelLang,
  loadPaths,
  loadSources,
  loadSubjects,
  loadTopics,
  makeEvents,
  nextEvidenceNeeded,
  projectTopic,
  readTopic,
  renderTopicServerSections,
  today,
  topicHistory,
  type Ctx,
  type NewEvent,
} from './context.js';
import { DataOps } from './data.js';

export type TextSectionName = 'summary' | 'studied' | 'understands' | 'gaps' | 'to_review';
export type EvidenceInput = Partial<Omit<EvidenceData, 'kind' | 'outcome'>> & Pick<EvidenceData, 'kind' | 'outcome'>;

const ROOT_README = `# Learning Mentor data

This folder holds your learning profile, written by the Learning Mentor plugin for Claude.
Everything here is plain text that you can read, back up or put under version control.

- \`learner-profile/\` — goals, preferences, per-subject overview
- \`knowledge-base/\` — one file per topic: level, what you understand, evidence
- \`learning-paths/\` — your plan per subject and per topic (stages)
- \`research-library/\` — notes on sources with links and freshness
- \`.mentor/\` — settings, the append-only journal, backups, trash

Sections between \`<!-- mentor:section … -->\` markers are maintained by the plugin; sections
marked as server-rendered (status, mistakes, evidence, levels, overview) are regenerated on
every update. You can write your own notes anywhere outside the markers.

Nothing in this folder is sent anywhere by the plugin.
`;

export class Mentor {
  readonly ctx: Ctx;
  readonly data: DataOps;

  constructor(root: string, clock: Clock) {
    this.ctx = { store: new Store(root), clock };
    this.data = new DataOps(this.ctx, this);
  }

  get store(): Store {
    return this.ctx.store;
  }
  get root(): string {
    return this.ctx.store.root;
  }

  private today(): string {
    return today(this.ctx);
  }

  async config(): Promise<Config> {
    return this.store.readConfig();
  }

  // ================================================================== init & settings

  async init(input: { workspace_path?: string; language?: string }): Promise<Record<string, unknown>> {
    return this.store.lock(async () => {
      const already = await this.store.isInitialized();
      const day = this.today();
      const created: string[] = [];
      const events: NewEvent[] = [];
      let config = already ? await this.store.readConfig() : ConfigSchema.parse({});
      if (!already) {
        if (input.language) config.label_language = toLabelLanguage(input.language);
        await this.store.writeMeta({ data_schema: DATA_SCHEMA, created: isoWithOffset(this.ctx.clock.now()), plugin_version_last_write: VERSION });
        events.push({ type: 'initialized', data: { plugin_version: VERSION } });
      }
      const lang = labelLang(config);
      if (!(await this.store.exists(rel.readme()))) {
        await this.store.writeText(rel.readme(), ROOT_README);
        created.push(rel.readme());
      }
      if (!(await this.store.exists(rel.profile()))) {
        const profile = ProfileSchema.parse({ schema: DATA_SCHEMA, kind: 'profile', created: day, updated: day });
        const doc = newDoc(profile);
        setSection(doc, 'notes', heading(lang, 'notes'), '');
        await this.store.writeDoc(rel.profile(), ProfileSchema, profile, doc);
        created.push(rel.profile());
      }
      if (!(await this.store.exists(rel.preferences()))) {
        const prefs = PreferencesSchema.parse({ schema: DATA_SCHEMA, kind: 'preferences', updated: day });
        const doc = newDoc(prefs);
        setSection(doc, 'notes', heading(lang, 'notes'), '');
        await this.store.writeDoc(rel.preferences(), PreferencesSchema, prefs, doc);
        created.push(rel.preferences());
      }
      let workspace: string | null = null;
      if (input.workspace_path) {
        workspace = await realOrResolved(input.workspace_path);
        if (!config.workspaces.some((w) => w === workspace)) {
          config.workspaces = [...config.workspaces, workspace];
          events.push({ type: 'workspace_registered', data: { path: workspace } });
        }
      }
      await this.store.writeConfig(config);
      if (events.length) await this.store.journal.append(makeEvents(this.ctx, events));
      const trashPruned = await this.store.pruneTrash(this.ctx.clock.now());
      return {
        root: this.root,
        already_initialized: already,
        created,
        workspace_registered: workspace,
        workspaces: config.workspaces,
        label_language: config.label_language,
        trash_pruned: trashPruned,
      };
    });
  }

  async settings(input: { set?: Partial<Config> & { remove_workspace?: string } }): Promise<Record<string, unknown>> {
    await this.store.assertInitialized();
    if (!input.set || !Object.keys(input.set).length) return { settings: await this.config() };
    return this.store.lock(async () => {
      const current = await this.config();
      const { remove_workspace, ...changes } = input.set!;
      const merged: Record<string, unknown> = { ...current, ...changes };
      if (changes.research) merged.research = { ...current.research, ...changes.research };
      if (remove_workspace) {
        const target = await realOrResolved(remove_workspace);
        merged.workspaces = current.workspaces.filter((w) => w !== target && w !== remove_workspace);
      }
      const parsed = ConfigSchema.safeParse(merged);
      if (!parsed.success) throw new MentorError('E_INVALID_INPUT', `Invalid setting: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      const changed: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of Object.keys(parsed.data) as (keyof Config)[]) {
        if (JSON.stringify(current[key]) !== JSON.stringify(parsed.data[key])) changed[key] = { from: current[key], to: parsed.data[key] };
      }
      await this.store.writeConfig(parsed.data);
      if (Object.keys(changed).length) await this.store.journal.append(makeEvents(this.ctx, [{ type: 'config_changed', data: { changed } }]));
      return { settings: parsed.data, changed: Object.keys(changed) };
    });
  }

  /** True if cwd is inside a registered learning workspace. */
  async workspaceFor(cwd: string, config?: Config): Promise<string | null> {
    const cfg = config ?? (await this.config());
    const real = await realOrResolved(cwd);
    return cfg.workspaces.find((w) => isInside(w, real)) ?? null;
  }

  // ================================================================== context & next

  async getContext(input: { subject?: string; cwd?: string }): Promise<{ card: string; workspace: string | null; data: Record<string, unknown> }> {
    await this.store.assertInitialized();
    if (input.subject) assertSlug('subject', input.subject);
    const config = await this.config();
    const [topics, subjects, paths] = await Promise.all([loadTopics(this.ctx), loadSubjects(this.ctx), loadPaths(this.ctx)]);
    const profile = await this.safeRead(rel.profile(), ProfileSchema);
    const preferences = await this.safeRead(rel.preferences(), PreferencesSchema);
    const lastSession = await this.lastSession();
    const workspace = input.cwd ? await this.workspaceFor(input.cwd, config) : null;
    const problems = [...topics.problems, ...subjects.problems, ...paths.problems, ...profile.problems, ...preferences.problems];
    const cardInput = {
      now: this.ctx.clock.now(),
      workspace,
      config,
      profile: profile.data,
      preferences: preferences.data,
      subjects: subjects.items.map((s) => s.data),
      topics: topics.items.map((t) => t.data),
      subjectPaths: paths.subjectPaths.items.map((p) => p.data),
      topicPaths: paths.topicPaths.items.map((p) => p.data),
      lastSession,
      problems,
      ...(input.subject ? { subject: input.subject } : {}),
    };
    return {
      card: buildCard(cardInput),
      workspace,
      data: {
        root: this.root,
        settings: config,
        subjects: cardInput.subjects.map((s) => ({ id: s.id, title: s.title, goal: s.goal, status: s.status })),
        topics: cardInput.topics
          .filter((t) => !input.subject || t.subject === input.subject)
          .map((t) => ({ id: t.id, title: t.title, level: t.level, provisional: t.provisional, review_due: t.review?.due ?? null })),
        problems,
      },
    };
  }

  private async safeRead<T>(relPath: string, schema: import('zod').ZodType<T>): Promise<{ data: T | null; problems: string[] }> {
    try {
      return { data: (await this.store.readDoc(relPath, schema))?.data ?? null, problems: [] };
    } catch (e) {
      if (e instanceof MentorError) return { data: null, problems: [`${relPath}: ${e.code}`] };
      throw e;
    }
  }

  private async lastSession(): Promise<{ day: string; notes: string[] } | null> {
    const { events } = await this.store.journal.readAll();
    const evidence = events.filter((e) => e.type === 'evidence_recorded');
    const last = evidence.at(-1);
    if (!last) return null;
    const notes = evidence
      .filter((e) => e.day === last.day)
      .map((e) => (typeof e.data.note === 'string' && e.data.note ? `${e.topic}: ${e.data.note}` : ''))
      .filter(Boolean)
      .slice(-2);
    return { day: last.day, notes };
  }

  async next(input: { subject?: string; limit?: number }): Promise<Record<string, unknown>> {
    await this.store.assertInitialized();
    if (input.subject) assertSlug('subject', input.subject);
    const [topics, paths] = await Promise.all([loadTopics(this.ctx), loadPaths(this.ctx)]);
    const recs = recommend({
      today: this.today(),
      topics: topics.items.map((t) => t.data),
      subjectPaths: paths.subjectPaths.items.map((p) => p.data),
      topicPaths: paths.topicPaths.items.map((p) => p.data),
      ...(input.subject ? { subject: input.subject } : {}),
      limit: input.limit ?? 5,
    });
    return { today: this.today(), recommendations: recs, problems: [...topics.problems, ...paths.problems] };
  }

  // ================================================================== topics

  async findTopics(input: { query: string; subject?: string; limit?: number }): Promise<Record<string, unknown>> {
    await this.store.assertInitialized();
    if (input.subject) assertSlug('subject', input.subject);
    const config = await this.config();
    const topics = await loadTopics(this.ctx, input.subject);
    const matches = searchTopics(
      input.query,
      topics.items.map((t) => ({ id: t.data.id, title: t.data.title, aliases: t.data.aliases, level: t.data.level, provisional: t.data.provisional })),
      Math.min(input.limit ?? 10, 20),
    ).map((m) => ({ ...m, level_label: levelLabel(config.label_language, m.level as Level | null, { provisional: m.provisional }) }));
    return { query: input.query, matches, problems: topics.problems };
  }

  async getTopic(input: { topic_id: string; evidence_limit?: number }): Promise<Record<string, unknown>> {
    await this.store.assertInitialized();
    const { subject, slug } = parseQualifiedId('topic', input.topic_id);
    const config = await this.config();
    const loaded = await readTopic(this.ctx, subject, slug);
    const t = loaded.data;
    const { events } = await this.store.journal.readAll();
    const history = topicHistory(events, t.id);
    const prerequisites = [];
    for (const p of t.prerequisites) {
      const { subject: ps, slug: pslug } = parseQualifiedId('topic', p);
      const pre = await this.store.readDoc(rel.topic(ps, pslug), TopicSchema).catch(() => null);
      prerequisites.push(
        pre
          ? { id: p, level: pre.data.level, provisional: pre.data.provisional, satisfied: pre.data.level !== null && pre.data.level >= 3 }
          : { id: p, level: null, provisional: false, satisfied: false, missing: true },
      );
    }
    const path = await this.store.readDoc(rel.topicPath(subject, slug), TopicPathSchema).catch(() => null);
    const sections: Record<string, string> = {};
    for (const name of ['summary', 'studied', 'understands', 'gaps', 'to_review']) sections[name] = getSection(loaded.doc, name)?.content ?? '';
    return {
      topic: t,
      level_label: levelLabel(config.label_language, t.level, { provisional: t.provisional, manual: t.level_source === 'override' }),
      next_evidence_needed: nextEvidenceNeeded(t, config),
      prerequisites,
      stages: path?.data.stages.map((s) => ({ id: s.id, title: s.title, status: s.status, goal: s.goal })) ?? [],
      sections,
      recent_evidence: history.evidence.slice(-(input.evidence_limit ?? 10)),
    };
  }

  async upsertTopic(input: {
    topic_id: string;
    title?: string;
    aliases?: string[];
    prerequisites?: string[];
    sections?: Partial<Record<TextSectionName, string>>;
    section_mode?: 'append' | 'replace';
  }): Promise<Record<string, unknown>> {
    await this.store.assertInitialized();
    const { subject, slug } = parseQualifiedId('topic', input.topic_id);
    for (const p of input.prerequisites ?? []) {
      parseQualifiedId('topic', p);
      if (p === input.topic_id) throw new MentorError('E_CYCLE', `Topic ${p} cannot be its own prerequisite.`);
    }
    assertNoSecrets({ title: input.title, ...Object.fromEntries(Object.entries(input.sections ?? {})) });
    return this.store.lock(async () => {
      const config = await this.config();
      const lang = labelLang(config);
      const day = this.today();
      const existing = await this.store.readDoc(rel.topic(subject, slug), TopicSchema);
      const created = !existing;
      if (created && !input.title) throw new MentorError('E_INVALID_INPUT', `New topic ${input.topic_id} needs a title.`);
      let topic: Topic = existing
        ? { ...existing.data, updated: day }
        : TopicSchema.parse({ schema: DATA_SCHEMA, kind: 'topic', id: input.topic_id, subject, title: input.title, created: day, updated: day });
      const metaChanges: Record<string, unknown> = {};
      if (input.title && input.title !== topic.title) metaChanges.title = topic.title = input.title;
      if (input.aliases) metaChanges.aliases = topic.aliases = [...new Set(input.aliases.map((a) => a.trim()).filter(Boolean))].slice(0, 20);
      if (input.prerequisites) metaChanges.prerequisites = topic.prerequisites = [...new Set(input.prerequisites)];
      const doc = existing?.doc ?? emptyTopicDoc(topic, lang);
      const sectionsWritten = this.writeTextSections(doc, input.sections, input.section_mode, lang, day);
      await this.ensureSubject(subject, day, lang);
      const events: NewEvent[] = [];
      if (created) events.push({ type: 'topic_created', subject, topic: topic.id, data: { title: topic.title, aliases: topic.aliases, prerequisites: topic.prerequisites } });
      else if (Object.keys(metaChanges).length) events.push({ type: 'topic_updated', subject, topic: topic.id, data: metaChanges });
      if (events.length) await this.store.journal.append(makeEvents(this.ctx, events));
      const { events: all } = await this.store.journal.readAll();
      const history = topicHistory(all, topic.id);
      // A new topic (or one recreated after deletion) is projected from its history since then.
      if (created) topic = projectTopic(topic, history, config);
      renderTopicServerSections(doc, topic, history.evidence, lang);
      await this.store.writeDoc(rel.topic(subject, slug), TopicSchema, topic, doc);
      await this.refreshSubjectOverview(subject);
      return { topic_id: topic.id, created, updated_fields: Object.keys(metaChanges), sections_written: sectionsWritten, level: topic.level };
    });
  }

  private writeTextSections(
    doc: import('../storage/markdown.js').MarkdownDoc,
    sections: Partial<Record<TextSectionName, string>> | undefined,
    mode: 'append' | 'replace' | undefined,
    lang: ReturnType<typeof labelLang>,
    day: string,
  ): string[] {
    const written: string[] = [];
    for (const [name, value] of Object.entries(sections ?? {})) {
      if (value === undefined) continue;
      const text = value.trim();
      if (text.length > 4000) throw new MentorError('E_INVALID_INPUT', `Section "${name}" is too long (max 4000 characters per update).`);
      if (name === 'summary' || mode === 'replace') setSection(doc, name, heading(lang, name), text);
      else {
        const lines = text.split('\n').map((l) => l.replace(/^[-*]\s+/, '').trim()).filter(Boolean);
        appendToSection(doc, name, heading(lang, name), lines.map((l) => `${day} · ${l}`), `${heading(lang, name)} (archive)`);
      }
      written.push(name);
    }
    return written;
  }

  private async ensureSubject(subject: string, day: string, lang: ReturnType<typeof labelLang>, extra: Partial<Subject> = {}): Promise<void> {
    const existing = await this.store.readDoc(rel.subject(subject), SubjectSchema);
    if (existing && !Object.keys(extra).length) return;
    const data = SubjectSchema.parse({
      ...(existing?.data ?? { schema: DATA_SCHEMA, kind: 'subject', id: subject, title: subject, started: day }),
      ...extra,
      updated: day,
    });
    const doc = existing?.doc ?? newDoc(data);
    if (!existing) {
      setSection(doc, 'levels', heading(lang, 'levels'), '');
      setSection(doc, 'notes', heading(lang, 'notes'), '');
    }
    await this.store.writeDoc(rel.subject(subject), SubjectSchema, data, doc);
    await this.store.journal.append(makeEvents(this.ctx, [{ type: 'profile_updated', subject, data: { target: `subject:${subject}`, snapshot: data } }]));
  }

  /** Regenerates the server-rendered levels table of a subject overview. */
  async refreshSubjectOverview(subject: string): Promise<void> {
    const existing = await this.store.readDoc(rel.subject(subject), SubjectSchema).catch(() => null);
    if (!existing) return;
    const config = await this.config();
    const topics = await loadTopics(this.ctx, subject);
    const lang = labelLang(config);
    const rows = topics.items
      .map((t) => t.data)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(
        (t) =>
          `| ${t.title} (\`${t.id}\`) | ${t.level ?? '–'} · ${levelLabel(lang, t.level, { provisional: t.provisional, manual: t.level_source === 'override' })} | ${t.review?.due ?? '—'} |`,
      );
    const header = lang === 'ru' ? '| Тема | Уровень | Повторить |\n|---|---|---|' : '| Topic | Level | Review due |\n|---|---|---|';
    setSection(existing.doc, 'levels', heading(lang, 'levels'), rows.length ? `${header}\n${rows.join('\n')}` : '');
    const recurring = new Set<string>();
    for (const t of topics.items) for (const m of t.data.misconceptions) if (m.status !== 'resolved') recurring.add(m.id);
    const data = { ...existing.data, recurring_errors: [...recurring].slice(0, 50) };
    await this.store.writeDoc(rel.subject(subject), SubjectSchema, data, existing.doc);
  }

  // ================================================================== evidence & levels

  async recordEvidence(input: { topic_id: string; events: EvidenceInput[] }): Promise<Record<string, unknown>> {
    await this.store.assertInitialized();
    const { subject, slug } = parseQualifiedId('topic', input.topic_id);
    if (!input.events.length || input.events.length > 10) throw new MentorError('E_INVALID_INPUT', 'Record between 1 and 10 evidence events per call.');
    const normalized = input.events.map((e) => {
      const data: EvidenceData = {
        kind: e.kind,
        outcome: e.outcome,
        independence: e.independence ?? (e.hint_level && e.hint_level > 0 ? 'assisted' : 'independent'),
        hint_level: e.hint_level ?? 0,
        context: e.context ?? 'learning',
        misconception: e.misconception ?? null,
        addresses: e.addresses ?? [],
        reported_level: e.reported_level ?? null,
        note: (e.note ?? '').trim(),
        quote: (e.quote ?? '').trim(),
      };
      if (data.kind === 'self_report' && data.reported_level === null) {
        throw new MentorError('E_INVALID_INPUT', 'self_report evidence needs reported_level (1-4).');
      }
      if (data.misconception) assertSlug('misconception', data.misconception.id);
      for (const a of data.addresses) assertSlug('misconception', a);
      assertNoSecrets({ note: data.note, quote: data.quote, misconception: data.misconception?.description });
      return data;
    });
    return this.store.lock(async () => {
      const config = await this.config();
      const lang = labelLang(config);
      const loaded = await readTopic(this.ctx, subject, slug);
      const before = loaded.data;
      const newEvents = makeEvents(
        this.ctx,
        normalized.map((d) => ({ type: 'evidence_recorded', subject, topic: before.id, data: d as unknown as Record<string, unknown> })),
      );
      await this.store.journal.append(newEvents); // commit point
      const { events: all } = await this.store.journal.readAll();
      const history = topicHistory(all, before.id);
      const after = projectTopic({ ...before, updated: this.today() }, history, config);
      const follow: NewEvent[] = [];
      if (after.level !== before.level || after.provisional !== before.provisional) {
        follow.push({
          type: 'level_changed',
          subject,
          topic: before.id,
          data: { from: before.level, to: after.level, provisional: after.provisional, reason: after.regressed_on && after.regressed_on !== before.regressed_on ? 'regression' : after.level_source },
        });
      }
      const changes = [];
      for (const m of after.misconceptions) {
        const prev = before.misconceptions.find((x) => x.id === m.id);
        if (!prev || prev.status !== m.status) {
          changes.push({ id: m.id, from: prev?.status ?? null, to: m.status });
          follow.push({ type: 'misconception_changed', subject, topic: before.id, data: { id: m.id, from: prev?.status ?? null, to: m.status } });
        }
      }
      if (follow.length) await this.store.journal.append(makeEvents(this.ctx, follow));
      renderTopicServerSections(loaded.doc, after, history.evidence, lang);
      await this.store.writeDoc(rel.topic(subject, slug), TopicSchema, after, loaded.doc);
      if (after.level !== before.level || changes.length || JSON.stringify(after.review) !== JSON.stringify(before.review)) {
        await this.refreshSubjectOverview(subject);
      }
      return {
        topic_id: after.id,
        recorded: newEvents.length,
        level_before: before.level,
        level_after: after.level,
        level_label: levelLabel(lang, after.level, { provisional: after.provisional }),
        provisional: after.provisional,
        level_changed: after.level !== before.level,
        regressed_on: after.regressed_on,
        review_due: after.review?.due ?? null,
        misconception_changes: changes,
        next_evidence_needed: nextEvidenceNeeded(after, config),
      };
    });
  }

  async setLevel(input: { topic_id: string; level: Level; reason: string }): Promise<Record<string, unknown>> {
    await this.store.assertInitialized();
    const { subject, slug } = parseQualifiedId('topic', input.topic_id);
    if (!input.reason?.trim()) throw new MentorError('E_INVALID_INPUT', 'A manual level needs a reason (e.g. what the learner said).');
    assertNoSecrets({ reason: input.reason });
    return this.store.lock(async () => {
      const config = await this.config();
      const loaded = await readTopic(this.ctx, subject, slug);
      await this.store.journal.append(makeEvents(this.ctx, [{ type: 'override', subject, topic: loaded.data.id, data: { level: input.level, reason: input.reason.trim().slice(0, 300) } }]));
      const { events: all } = await this.store.journal.readAll();
      const history = topicHistory(all, loaded.data.id);
      const after = projectTopic({ ...loaded.data, updated: this.today() }, history, config);
      await this.store.journal.append(
        makeEvents(this.ctx, [{ type: 'level_changed', subject, topic: after.id, data: { from: loaded.data.level, to: after.level, provisional: false, reason: 'override' } }]),
      );
      renderTopicServerSections(loaded.doc, after, history.evidence, labelLang(config));
      await this.store.writeDoc(rel.topic(subject, slug), TopicSchema, after, loaded.doc);
      await this.refreshSubjectOverview(subject);
      return { topic_id: after.id, level: after.level, level_label: levelLabel(config.label_language, after.level, { manual: true }) };
    });
  }

  // ================================================================== paths & stages

  async planPath(input: {
    subject: string;
    goal: string;
    topics: { topic_id: string; title?: string; prerequisites?: string[] }[];
    create_missing?: boolean;
    mode?: 'create' | 'merge';
  }): Promise<Record<string, unknown>> {
    await this.store.assertInitialized();
    const subject = assertSlug('subject', input.subject);
    for (const t of input.topics) {
      if (parseQualifiedId('topic', t.topic_id).subject !== subject) throw new MentorError('E_INVALID_INPUT', `Topic ${t.topic_id} does not belong to subject ${subject}.`);
    }
    assertNoSecrets({ goal: input.goal });
    return this.store.lock(async () => {
      const config = await this.config();
      const lang = labelLang(config);
      const day = this.today();
      const existing = await this.store.readDoc(rel.subjectPath(subject), SubjectPathSchema);
      const mode = input.mode ?? (existing ? 'merge' : 'create');
      let nodes = input.topics.map((t) => ({ id: t.topic_id, prerequisites: [...new Set(t.prerequisites ?? [])] }));
      if (mode === 'merge' && existing) {
        const incoming = new Map(nodes.map((n) => [n.id, n]));
        const merged = existing.data.topics.map((n) => incoming.get(n.id) ?? { id: n.id, prerequisites: n.prerequisites });
        for (const n of nodes) if (!existing.data.topics.some((x) => x.id === n.id)) merged.push(n);
        nodes = merged;
      }
      const allTopics = await loadTopics(this.ctx);
      const known = new Set(allTopics.items.map((t) => t.data.id));
      const order = topologicalOrder(nodes, known);
      const missing = nodes.filter((n) => !known.has(n.id)).map((n) => n.id);
      const missingPrereqs = nodes.flatMap((n) => n.prerequisites).filter((p) => !known.has(p) && !nodes.some((n) => n.id === p));
      if (missingPrereqs.length) throw new MentorError('E_INVALID_INPUT', `Unknown prerequisites: ${[...new Set(missingPrereqs)].join(', ')}.`);
      if (missing.length && !input.create_missing) {
        throw new MentorError('E_NOT_FOUND', `These topics do not exist yet: ${missing.join(', ')}. Pass create_missing: true (with titles) to create them.`);
      }
      const titles = new Map(input.topics.map((t) => [t.topic_id, t.title]));
      for (const id of missing) {
        const title = titles.get(id);
        if (!title) throw new MentorError('E_INVALID_INPUT', `New topic ${id} needs a title.`);
      }
      const sorted = order.map((id) => nodes.find((n) => n.id === id)!);
      const data: SubjectPath = SubjectPathSchema.parse({
        schema: DATA_SCHEMA,
        kind: 'subject_path',
        subject,
        goal: input.goal,
        created: existing?.data.created ?? day,
        updated: day,
        topics: sorted,
      });
      await this.store.journal.append(makeEvents(this.ctx, [{ type: 'path_updated', subject, data: { mode, snapshot: data } }]));
      // Create stub topics and keep topic prerequisites in sync with the path (the path is authoritative).
      for (const n of sorted) {
        const { slug } = parseQualifiedId('topic', n.id);
        const t = await this.store.readDoc(rel.topic(subject, slug), TopicSchema);
        if (!t) {
          const stub = TopicSchema.parse({ schema: DATA_SCHEMA, kind: 'topic', id: n.id, subject, title: titles.get(n.id), created: day, updated: day, prerequisites: n.prerequisites });
          await this.store.journal.append(makeEvents(this.ctx, [{ type: 'topic_created', subject, topic: n.id, data: { title: stub.title, aliases: [], prerequisites: stub.prerequisites } }]));
          await this.store.writeDoc(rel.topic(subject, slug), TopicSchema, stub, emptyTopicDoc(stub, lang));
        } else if (JSON.stringify(t.data.prerequisites) !== JSON.stringify(n.prerequisites)) {
          await this.store.journal.append(makeEvents(this.ctx, [{ type: 'topic_updated', subject, topic: n.id, data: { prerequisites: n.prerequisites } }]));
          await this.store.writeDoc(rel.topic(subject, slug), TopicSchema, { ...t.data, prerequisites: n.prerequisites, updated: day }, t.doc);
        }
      }
      await this.ensureSubject(subject, day, lang, existing ? {} : { goal: input.goal });
      const doc = existing?.doc ?? newDoc(data);
      await this.store.writeDoc(rel.subjectPath(subject), SubjectPathSchema, data, doc);
      await this.refreshSubjectPathOverview(subject);
      await this.refreshSubjectOverview(subject);
      return { subject, mode, order, created_topics: missing };
    });
  }

  async refreshSubjectPathOverview(subject: string): Promise<void> {
    const sp = await this.store.readDoc(rel.subjectPath(subject), SubjectPathSchema).catch(() => null);
    if (!sp) return;
    const config = await this.config();
    const lang = labelLang(config);
    const topics = new Map((await loadTopics(this.ctx, subject)).items.map((t) => [t.data.id, t.data]));
    const lines = sp.data.topics.map((n, i) => {
      const t = topics.get(n.id);
      const missing = n.prerequisites.filter((p) => {
        const pt = topics.get(p);
        return !pt || pt.level === null || pt.level < 3;
      });
      const state = t?.level === 4 ? 'done' : missing.length ? `blocked by ${missing.join(', ')}` : 'available';
      return `${i + 1}. ${t?.title ?? n.id} (\`${n.id}\`) — ${levelLabel(lang, t?.level ?? null, { provisional: t?.provisional ?? false })} — ${state}`;
    });
    setSection(sp.doc, 'overview', heading(lang, 'overview'), lines.join('\n'));
    if (!getSection(sp.doc, 'notes')) setSection(sp.doc, 'notes', heading(lang, 'notes'), '');
    await this.store.writeDoc(rel.subjectPath(subject), SubjectPathSchema, sp.data, sp.doc);
  }

  async planTopic(input: {
    topic_id: string;
    goal?: string;
    stages: { id: string; title: string; goal: string; criteria: { kind: Stage['criteria'][number]['kind']; min?: number; independent?: boolean }[] }[];
    mode?: 'create' | 'replace_pending' | 'insert';
    after_stage_id?: string;
    next_topics?: string[];
  }): Promise<Record<string, unknown>> {
    await this.store.assertInitialized();
    const { subject, slug } = parseQualifiedId('topic', input.topic_id);
    for (const n of input.next_topics ?? []) parseQualifiedId('topic', n);
    assertNoSecrets({ goal: input.goal, stages: input.stages.map((s) => `${s.title} ${s.goal}`).join(' ') });
    return this.store.lock(async () => {
      const config = await this.config();
      const lang = labelLang(config);
      const day = this.today();
      await readTopic(this.ctx, subject, slug);
      const existing = await this.store.readDoc(rel.topicPath(subject, slug), TopicPathSchema);
      const mode = input.mode ?? (existing ? 'replace_pending' : 'create');
      const newStages = input.stages.map((s) => StageSchema.parse({ ...s, status: 'pending' }));
      let stages: Stage[];
      if (mode === 'create' || !existing) {
        if (existing && existing.data.stages.some((s) => s.status !== 'pending')) {
          throw new MentorError('E_CONFLICT', `Topic ${input.topic_id} already has started stages. Use mode "replace_pending" or "insert".`);
        }
        stages = newStages;
      } else if (mode === 'replace_pending') {
        const kept = existing.data.stages.filter((s) => s.status !== 'pending');
        stages = [...kept, ...newStages.filter((s) => !kept.some((k) => k.id === s.id))];
      } else {
        const idx = input.after_stage_id ? existing.data.stages.findIndex((s) => s.id === input.after_stage_id) : existing.data.stages.length - 1;
        if (idx === -1) throw new MentorError('E_NOT_FOUND', `Stage ${input.after_stage_id} not found in ${input.topic_id}.`);
        stages = [...existing.data.stages.slice(0, idx + 1), ...newStages, ...existing.data.stages.slice(idx + 1)];
      }
      const ids = stages.map((s) => s.id);
      if (new Set(ids).size !== ids.length) throw new MentorError('E_INVALID_INPUT', `Stage ids must be unique within a topic: ${ids.join(', ')}.`);
      if (!stages.some((s) => s.status === 'active' || s.status === 'pending' || s.status === 'done' || s.status === 'skipped')) {
        throw new MentorError('E_INVALID_INPUT', 'A topic path needs at least one stage.');
      }
      // Activate the first pending stage if nothing is active.
      if (!stages.some((s) => s.status === 'active')) {
        const first = stages.find((s) => s.status === 'pending');
        if (first) {
          first.status = 'active';
          first.started = day;
        }
      }
      const goal = input.goal ?? existing?.data.goal;
      if (!goal) throw new MentorError('E_INVALID_INPUT', 'A new topic path needs a goal.');
      const data: TopicPath = TopicPathSchema.parse({
        schema: DATA_SCHEMA,
        kind: 'topic_path',
        topic: input.topic_id,
        goal,
        created: existing?.data.created ?? day,
        updated: day,
        next_topics: input.next_topics ?? existing?.data.next_topics ?? [],
        stages,
      });
      await this.store.journal.append(makeEvents(this.ctx, [{ type: 'topic_path_updated', subject, topic: input.topic_id, data: { mode, snapshot: data } }]));
      const doc = existing?.doc ?? newDoc(data);
      this.renderTopicPathOverview(doc, data, lang);
      await this.store.writeDoc(rel.topicPath(subject, slug), TopicPathSchema, data, doc);
      return { topic_id: input.topic_id, mode, stages: data.stages.map((s) => ({ id: s.id, title: s.title, status: s.status })) };
    });
  }

  private renderTopicPathOverview(doc: import('../storage/markdown.js').MarkdownDoc, p: TopicPath, lang: ReturnType<typeof labelLang>): void {
    const mark: Record<Stage['status'], string> = { done: '[x]', active: '[>]', pending: '[ ]', skipped: '[-]' };
    const lines = p.stages.map((s, i) => {
      const crit = s.criteria.map((c) => `${c.min}× ${c.kind}${c.independent ? ' (independent)' : ''}`).join(', ');
      const extra = s.status === 'skipped' && s.skip_reason ? ` — skipped: ${s.skip_reason}` : '';
      return `${mark[s.status]} ${i + 1}. ${s.title} — ${s.goal} _(${crit})_${extra}`;
    });
    setSection(doc, 'overview', heading(lang, 'overview'), lines.join('\n'));
    if (!getSection(doc, 'notes')) setSection(doc, 'notes', heading(lang, 'notes'), '');
  }

  async updateStage(input: {
    topic_id: string;
    stage_id: string;
    status: Stage['status'];
    reason?: string;
    override_reason?: string;
  }): Promise<Record<string, unknown>> {
    await this.store.assertInitialized();
    const { subject, slug } = parseQualifiedId('topic', input.topic_id);
    return this.store.lock(async () => {
      const config = await this.config();
      const day = this.today();
      const p = await this.store.readDoc(rel.topicPath(subject, slug), TopicPathSchema);
      if (!p) throw new MentorError('E_NOT_FOUND', `Topic ${input.topic_id} has no stage plan. Create one with mentor_plan_topic.`);
      const stage = p.data.stages.find((s) => s.id === input.stage_id);
      if (!stage) throw new MentorError('E_NOT_FOUND', `Stage ${input.stage_id} not found. Stages: ${p.data.stages.map((s) => s.id).join(', ')}.`);
      const from = stage.status;
      assertTransition(stage, input.status);
      if (input.status === 'done') {
        const { events } = await this.store.journal.readAll();
        const unmet = unmetCriteria(stage, topicHistory(events, input.topic_id).evidence);
        if (unmet.length && !input.override_reason) {
          throw new MentorError(
            'E_CRITERIA_UNMET',
            `Stage "${stage.id}" is not complete yet. Missing: ${unmet
              .map((u) => `${u.need - u.have} more successful ${u.kind}${u.independent ? ' (independent)' : ''}`)
              .join('; ')}. Record that evidence first, or pass override_reason if completion is justified otherwise.`,
            { unmet },
          );
        }
        stage.completed = day;
        if (unmet.length && input.override_reason) stage.override_reason = input.override_reason.slice(0, 300);
      }
      if (input.status === 'skipped') {
        if (!input.reason) throw new MentorError('E_INVALID_INPUT', 'Skipping a stage needs a reason (e.g. "learner already demonstrated it").');
        stage.skip_reason = input.reason.slice(0, 300);
      }
      if (input.status === 'active') {
        for (const s of p.data.stages) if (s !== stage && s.status === 'active') {
          s.status = 'pending';
        }
        stage.started = day;
      }
      if (input.status === 'pending') stage.started = null;
      stage.status = input.status;
      // Auto-advance: after done/skipped, activate the next pending stage.
      let activated: string | null = null;
      if ((input.status === 'done' || input.status === 'skipped') && !p.data.stages.some((s) => s.status === 'active')) {
        const next = p.data.stages.find((s) => s.status === 'pending');
        if (next) {
          next.status = 'active';
          next.started = day;
          activated = next.id;
        }
      }
      p.data.updated = day;
      await this.store.journal.append(
        makeEvents(this.ctx, [
          { type: 'stage_changed', subject, topic: input.topic_id, data: { stage: stage.id, from, to: input.status, override_reason: input.override_reason ?? null, activated } },
          { type: 'topic_path_updated', subject, topic: input.topic_id, data: { mode: 'stage', snapshot: p.data } },
        ]),
      );
      this.renderTopicPathOverview(p.doc, p.data, labelLang(config));
      await this.store.writeDoc(rel.topicPath(subject, slug), TopicPathSchema, p.data, p.doc);
      const done = p.data.stages.every((s) => s.status === 'done' || s.status === 'skipped');
      return {
        topic_id: input.topic_id,
        stage: stage.id,
        status: stage.status,
        activated_next: activated,
        path_complete: done,
        progress: `${p.data.stages.filter((s) => s.status === 'done' || s.status === 'skipped').length}/${p.data.stages.length}`,
      };
    });
  }

  // ================================================================== profile

  async updateProfile(input: {
    target: string;
    add?: Record<string, string[]>;
    remove?: Record<string, string[]>;
    set?: Record<string, string | null>;
    notes?: string;
  }): Promise<Record<string, unknown>> {
    await this.store.assertInitialized();
    const allText = [
      ...Object.values(input.add ?? {}).flat(),
      ...Object.values(input.set ?? {}).filter((v): v is string => typeof v === 'string'),
      input.notes ?? '',
    ].join('\n');
    assertNoSecrets({ profile: allText });
    return this.store.lock(async () => {
      const config = await this.config();
      const lang = labelLang(config);
      const day = this.today();
      let relPath: string;
      let schema: typeof ProfileSchema | typeof PreferencesSchema | typeof SubjectSchema;
      let lists: string[];
      let scalars: string[];
      if (input.target === 'profile') {
        relPath = rel.profile();
        schema = ProfileSchema;
        lists = ['background', 'goals', 'strengths', 'weaknesses', 'recommendations'];
        scalars = ['display_name'];
      } else if (input.target === 'preferences') {
        relPath = rel.preferences();
        schema = PreferencesSchema;
        lists = ['observed'];
        scalars = ['pace', 'explanation_depth'];
      } else if (input.target.startsWith('subject:')) {
        const subject = assertSlug('subject', input.target.slice('subject:'.length));
        await this.ensureSubject(subject, day, lang);
        relPath = rel.subject(subject);
        schema = SubjectSchema;
        lists = ['strengths', 'weaknesses', 'aliases'];
        scalars = ['title', 'goal', 'status'];
      } else {
        throw new MentorError('E_INVALID_INPUT', 'target must be "profile", "preferences" or "subject:<id>".');
      }
      const loaded = await this.store.readDoc(relPath, schema as typeof ProfileSchema);
      if (!loaded) throw new MentorError('E_NOT_FOUND', `${relPath} is missing. Run mentor_doctor with repair: true.`);
      const data = { ...(loaded.data as Record<string, unknown>) };
      for (const [field, values] of Object.entries(input.add ?? {})) {
        if (!lists.includes(field)) throw new MentorError('E_INVALID_INPUT', `Cannot add to "${field}" in ${input.target}. Allowed: ${lists.join(', ')}.`);
        const current = (data[field] as unknown[]) ?? [];
        if (field === 'observed') data[field] = [...current, ...values.map((note) => ({ day, note }))].slice(-100);
        else data[field] = [...new Set([...(current as string[]), ...values.map((v) => v.trim()).filter(Boolean)])];
      }
      for (const [field, values] of Object.entries(input.remove ?? {})) {
        if (!lists.includes(field)) throw new MentorError('E_INVALID_INPUT', `Cannot remove from "${field}". Allowed: ${lists.join(', ')}.`);
        const current = (data[field] as unknown[]) ?? [];
        data[field] = current.filter((item) => {
          const text = typeof item === 'string' ? item : (item as { note: string }).note;
          return !values.includes(text);
        });
      }
      for (const [field, value] of Object.entries(input.set ?? {})) {
        if (!scalars.includes(field)) throw new MentorError('E_INVALID_INPUT', `Cannot set "${field}" in ${input.target}. Allowed: ${scalars.join(', ')}.`);
        data[field] = value;
      }
      data.updated = day;
      const parsed = (schema as typeof ProfileSchema).safeParse(data);
      if (!parsed.success) throw new MentorError('E_INVALID_INPUT', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      if (input.notes?.trim()) appendToSection(loaded.doc, 'notes', heading(lang, 'notes'), [`${day} · ${input.notes.trim()}`], `${heading(lang, 'notes')} (archive)`);
      await this.store.journal.append(makeEvents(this.ctx, [{ type: 'profile_updated', data: { target: input.target, snapshot: parsed.data } }]));
      await this.store.writeDoc(relPath, schema as typeof ProfileSchema, parsed.data as Profile, loaded.doc);
      return { target: input.target, data: parsed.data };
    });
  }

  // ================================================================== research library

  async saveSource(input: {
    subject: string;
    source_slug: string;
    url: string;
    title: string;
    publisher: string;
    tier: number;
    topics?: string[];
    technology?: string | null;
    technology_version?: string | null;
    published?: string | null;
    volatility: Source['volatility'];
    key_points: string[];
    quotes?: string[];
    conflicts?: string[];
  }): Promise<Record<string, unknown>> {
    await this.store.assertInitialized();
    const subject = assertSlug('subject', input.subject);
    const slug = assertSlug('source', input.source_slug);
    let url: URL;
    try {
      url = new URL(input.url);
    } catch {
      throw new MentorError('E_INVALID_INPUT', `Not a valid URL: ${input.url}`);
    }
    if (url.protocol !== 'https:') throw new MentorError('E_INVALID_INPUT', 'Only https:// sources can be saved.');
    if (url.username || url.password) throw new MentorError('E_INVALID_INPUT', 'URLs with embedded credentials are not accepted.');
    const clean = (s: string) => s.replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
    const keyPoints = input.key_points.map(clean).filter(Boolean);
    const quotes = (input.quotes ?? []).map(clean).filter(Boolean);
    if (!keyPoints.length) throw new MentorError('E_INVALID_INPUT', 'Save at least one key point in your own words.');
    if (keyPoints.length > 15) throw new MentorError('E_INVALID_INPUT', 'At most 15 key points.');
    if (keyPoints.some((k) => k.length > 400)) throw new MentorError('E_INVALID_INPUT', 'Each key point must be at most 400 characters.');
    if (quotes.length > 5) throw new MentorError('E_INVALID_INPUT', 'At most 5 short quotes.');
    const longQuote = quotes.find((q) => q.split(/\s+/).length > 25);
    if (longQuote) throw new MentorError('E_INVALID_INPUT', 'Quotes must be at most 25 words; summarise in your own words instead.');
    for (const t of input.topics ?? []) parseQualifiedId('topic', t);
    assertNoSecrets({ key_points: keyPoints.join('\n'), quotes: quotes.join('\n'), title: input.title });
    return this.store.lock(async () => {
      const config = await this.config();
      const lang = labelLang(config);
      const day = this.today();
      const relPath = rel.source(subject, slug);
      const existing = await this.store.readDoc(relPath, SourceSchema).catch((e) => {
        if (e instanceof MentorError && e.code === 'E_CORRUPT') return null;
        throw e;
      });
      const data = SourceSchema.parse({
        schema: DATA_SCHEMA,
        kind: 'source',
        id: qualifiedId(subject, slug),
        subject,
        topics: input.topics ?? existing?.data.topics ?? [],
        url: url.toString(),
        title: clean(input.title),
        publisher: clean(input.publisher),
        tier: input.tier,
        technology: input.technology ?? null,
        technology_version: input.technology_version ?? null,
        published: input.published ?? null,
        accessed_at: existing?.data.accessed_at ?? day,
        verified_at: day,
        volatility: input.volatility,
        conflicts: (input.conflicts ?? []).map(clean).filter(Boolean),
      });
      const doc = existing?.doc ?? newDoc(data);
      setSection(doc, 'key_points', heading(lang, 'key_points'), keyPoints.map((k) => `- ${k}`).join('\n'));
      setSection(doc, 'quotes', heading(lang, 'quotes'), quotes.map((q) => `> ${q}`).join('\n\n'));
      if (!getSection(doc, 'notes')) setSection(doc, 'notes', heading(lang, 'notes'), '');
      await this.store.journal.append(makeEvents(this.ctx, [{ type: 'source_saved', subject, data: { id: data.id, url: data.url, tier: data.tier, snapshot: data } }]));
      await this.store.writeDoc(relPath, SourceSchema, data, doc);
      return { source_id: data.id, created: !existing, freshness: freshness(data, config, day) };
    });
  }

  async findSources(input: { subject?: string; topic_id?: string; query?: string; include_stale?: boolean }): Promise<Record<string, unknown>> {
    await this.store.assertInitialized();
    if (input.subject) assertSlug('subject', input.subject);
    const config = await this.config();
    const day = this.today();
    const sources = await loadSources(this.ctx, input.subject);
    const q = input.query?.toLowerCase();
    const items = sources.items
      .filter((s) => !input.topic_id || s.data.topics.includes(input.topic_id))
      .filter((s) => !q || `${s.data.title} ${s.data.technology ?? ''} ${s.data.publisher} ${getSection(s.doc, 'key_points')?.content ?? ''}`.toLowerCase().includes(q))
      .map((s) => ({
        id: s.data.id,
        title: s.data.title,
        url: s.data.url,
        publisher: s.data.publisher,
        tier: s.data.tier,
        technology: s.data.technology,
        technology_version: s.data.technology_version,
        verified_at: s.data.verified_at,
        freshness: freshness(s.data, config, day),
        key_points: (getSection(s.doc, 'key_points')?.content ?? '').split('\n').filter(Boolean),
        conflicts: s.data.conflicts,
      }))
      .filter((s) => input.include_stale !== false || s.freshness === 'fresh')
      .sort((a, b) => a.tier - b.tier || (a.verified_at < b.verified_at ? 1 : -1));
    return { today: day, sources: items, problems: sources.problems };
  }
}

export { localDay };
