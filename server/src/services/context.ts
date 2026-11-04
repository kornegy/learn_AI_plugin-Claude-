/**
 * Shared service context: the store, the clock, journal helpers and topic projection.
 * Services are the only callers of storage; MCP tools and the hook call services.
 */
import { MentorError } from '../core/errors.js';
import { isoWithOffset, localDay, type Clock } from '../core/clock.js';
import { ulid } from '../core/ids.js';
import { heading, levelLabel, type LabelLanguage } from '../core/labels.js';
import {
  EvidenceDataSchema,
  SourceSchema,
  SubjectPathSchema,
  SubjectSchema,
  TopicPathSchema,
  TopicSchema,
  type Config,
  type JournalEvent,
  type Topic,
} from '../schema/index.js';
import { computeMastery, evidenceCounts } from '../engine/mastery.js';
import { computeMisconceptions } from '../engine/misconceptions.js';
import { computeReview } from '../engine/scheduler.js';
import { byTime, instant, type EvidenceRecord, type OverrideRecord } from '../engine/evidence.js';
import { findSecret } from '../engine/secrets.js';
import { getSection, newDoc, setSection, type MarkdownDoc } from '../storage/markdown.js';
import { DIRS, rel } from '../storage/root.js';
import type { LoadedDoc, Store } from '../storage/store.js';

declare const __MENTOR_VERSION__: string | undefined;
export const VERSION: string = typeof __MENTOR_VERSION__ === 'string' ? __MENTOR_VERSION__ : '0.0.0-dev';

export interface Ctx {
  store: Store;
  clock: Clock;
}

export function today(ctx: Ctx): string {
  return localDay(ctx.clock.now());
}

/** Builds journal events with strictly increasing ids for one operation. */
export interface NewEvent {
  type: string;
  subject?: string;
  topic?: string;
  data?: Record<string, unknown>;
}

export function makeEvents(ctx: Ctx, items: NewEvent[]): JournalEvent[] {
  const now = ctx.clock.now();
  return items.map((it, i) => {
    const ev: JournalEvent = {
      v: 1,
      id: ulid(new Date(now.getTime() + i)),
      ts: isoWithOffset(now),
      day: localDay(now),
      type: it.type,
      data: it.data ?? {},
    };
    if (it.subject) ev.subject = it.subject;
    if (it.topic) ev.topic = it.topic;
    return ev;
  });
}

export function assertNoSecrets(fields: Record<string, string | undefined | null>): void {
  for (const [name, value] of Object.entries(fields)) {
    if (!value) continue;
    const hit = findSecret(value);
    if (hit) {
      throw new MentorError(
        'E_SECRET_DETECTED',
        `The field "${name}" looks like it contains a secret (${hit}). It was not saved. Rephrase without credentials.`,
        { field: name },
      );
    }
  }
}

// ------------------------------------------------------------------ journal views

/**
 * Journal grouped by topic, built in one pass. Use it whenever histories of many topics are
 * needed (card, insights, doctor): scanning all events per topic is O(topics × events).
 */
export class JournalIndex {
  private readonly byTopic = new Map<string, JournalEvent[]>();
  private readonly deletes: JournalEvent[] = [];

  constructor(events: JournalEvent[]) {
    for (const e of events) {
      if (e.type === 'delete') this.deletes.push(e);
      if (!e.topic) continue;
      const list = this.byTopic.get(e.topic);
      if (list) list.push(e);
      else this.byTopic.set(e.topic, [e]);
    }
  }

  topicIds(): string[] {
    return [...this.byTopic.keys()];
  }

  /** Instant of the latest delete covering this topic (topic, its subject, or everything). */
  private cutoff(topicId: string): number | null {
    const subject = topicId.split('/')[0];
    let cutoff: number | null = null;
    for (const e of this.deletes) {
      const scope = e.data.scope as string | undefined;
      const target = e.data.target as string | undefined;
      if (scope === 'all' || (scope === 'subject' && target === subject) || (scope === 'topic' && target === topicId)) {
        const t = instant(e.ts);
        if (cutoff === null || t > cutoff) cutoff = t;
      }
    }
    return cutoff;
  }

  history(topicId: string): TopicHistory {
    const cutoff = this.cutoff(topicId);
    const evidence: EvidenceRecord[] = [];
    const overrides: OverrideRecord[] = [];
    let meta: TopicHistory['meta'] = null;
    for (const e of this.byTopic.get(topicId) ?? []) {
      if (cutoff !== null && instant(e.ts) <= cutoff) continue;
      if (e.type === 'evidence_recorded') {
        const parsed = EvidenceDataSchema.safeParse(e.data);
        if (parsed.success) evidence.push({ ...parsed.data, id: e.id, ts: e.ts, day: e.day });
      } else if (e.type === 'override') {
        const level = e.data.level;
        if (level === 1 || level === 2 || level === 3 || level === 4) {
          overrides.push({ id: e.id, ts: e.ts, day: e.day, level, reason: String(e.data.reason ?? '') });
        }
      } else if (e.type === 'topic_created' || e.type === 'topic_updated') {
        meta = { ...(meta ?? {}), ...(e.data as object), ...(e.type === 'topic_created' ? { created: e.day } : {}) };
      }
    }
    evidence.sort(byTime);
    return { evidence, overrides, meta };
  }
}

export interface TopicHistory {
  evidence: EvidenceRecord[];
  overrides: OverrideRecord[];
  meta: { title?: string; aliases?: string[]; prerequisites?: string[]; created?: string } | null;
}

/** History of one topic. Pass a JournalIndex when you need many topics. */
export function topicHistory(source: JournalEvent[] | JournalIndex, topicId: string): TopicHistory {
  const index = source instanceof JournalIndex ? source : new JournalIndex(source.filter((e) => e.topic === topicId || e.type === 'delete'));
  return index.history(topicId);
}

/** Recomputes all derived topic fields from its history (ARCHITECTURE §6-§7). */
export function projectTopic(fm: Topic, history: TopicHistory, config: Config): Topic {
  const mastery = computeMastery(history.evidence, history.overrides, config.assessment_strictness);
  const assessed = history.evidence.filter((e) => e.kind !== 'exposure').map((e) => e.day);
  return {
    ...fm,
    level: mastery.level,
    provisional: mastery.provisional,
    level_source: mastery.source,
    regressed_on: mastery.regressedOn,
    last_assessed: assessed.length ? assessed[assessed.length - 1]! : null,
    evidence_counts: evidenceCounts(history.evidence),
    misconceptions: computeMisconceptions(history.evidence),
    review: computeReview(history.evidence, history.overrides, config.assessment_strictness, config.review_intensity),
  };
}

/** Plain-language statement of what evidence would raise the level next. */
export function nextEvidenceNeeded(t: Topic, config: Config): string {
  const open = t.misconceptions.filter((m) => m.status === 'open' || m.status === 'recurring');
  if (t.level === 4) return 'Level is at maximum; keep it with spaced reviews.';
  if (t.level === null || t.level === 1) return 'A correct recall, or better an explanation in the learner\'s own words, would raise the level.';
  if (t.level === 2) {
    return t.regressed_on
      ? 'Re-demonstrate after the failed check: a correct recall or explanation now, then an application.'
      : 'An explanation in the learner\'s own words or an application (even with hints) would raise it to 3.';
  }
  const rule =
    config.assessment_strictness === 'lenient'
      ? 'an explanation plus one independent application (or a transfer)'
      : config.assessment_strictness === 'standard'
        ? 'an explanation plus independent applications on 2 different days, or a transfer to a new context'
        : 'an explanation, independent applications on 2 different days AND a transfer';
  return `Level 4 needs ${rule}${open.length ? `, and resolving: ${open.map((m) => m.id).join(', ')}` : ''}.`;
}

// ------------------------------------------------------------------ documents

export function labelLang(config: Config): LabelLanguage {
  return config.label_language;
}

export function topicStatusLine(t: Topic, lang: LabelLanguage): string {
  const label = levelLabel(lang, t.level, { provisional: t.provisional, manual: t.level_source === 'override' });
  const parts = [`**${t.level ?? '–'} · ${label}**`];
  parts.push(lang === 'ru' ? `последняя проверка: ${t.last_assessed ?? '—'}` : `last checked: ${t.last_assessed ?? '—'}`);
  if (t.review) parts.push(lang === 'ru' ? `повторить: ${t.review.due}` : `review due: ${t.review.due}`);
  return parts.join(' · ');
}

export function renderEvidenceLine(e: EvidenceRecord): string {
  const indep = e.independence === 'assisted' || e.hint_level > 0 ? `assisted (hint ${e.hint_level})` : 'independent';
  const quote = e.quote ? ` "${e.quote.replace(/\s+/g, ' ')}"` : '';
  const note = e.note ? ` — ${e.note.replace(/\s+/g, ' ')}` : '';
  return `- ${e.day} · ${e.kind} · ${e.outcome} · ${indep} · ${e.context}${note}${quote}`;
}

/** Writes the server-owned sections of a topic document. */
export function renderTopicServerSections(doc: MarkdownDoc, t: Topic, evidence: EvidenceRecord[], lang: LabelLanguage): void {
  const statusExisting = getSection(doc, 'status');
  if (!statusExisting) {
    // Status goes first: put it before everything else.
    doc.segments.unshift({ type: 'section', name: 'status', heading: heading(lang, 'status'), content: topicStatusLine(t, lang) });
  } else {
    statusExisting.content = topicStatusLine(t, lang);
  }
  const errors = t.misconceptions.map(
    (m) => `- ${m.id}: ${m.description} — ${m.status}, ${m.occurrences}× (${m.first_seen} … ${m.last_seen})`,
  );
  const recentFails = evidence.filter((e) => e.outcome !== 'success' && !e.misconception && e.kind !== 'exposure').slice(-5);
  for (const e of recentFails) errors.push(`- ${e.day} · ${e.kind} · ${e.outcome}${e.note ? ` — ${e.note}` : ''}`);
  setSection(doc, 'errors', heading(lang, 'errors'), errors.join('\n'));
  setSection(doc, 'evidence', heading(lang, 'evidence'), evidence.filter((e) => e.kind !== 'exposure').slice(-20).map(renderEvidenceLine).join('\n'));
}

export function emptyTopicDoc(t: Topic, lang: LabelLanguage): MarkdownDoc {
  const doc = newDoc(t);
  for (const name of ['summary', 'studied', 'understands', 'gaps']) setSection(doc, name, heading(lang, name), '');
  renderTopicServerSections(doc, t, [], lang);
  setSection(doc, 'to_review', heading(lang, 'to_review'), '');
  return doc;
}

// ------------------------------------------------------------------ loading collections

export interface Collection<T> {
  items: { data: T; relPath: string }[];
  problems: string[];
}

/** Bulk load of frontmatter through the store's cache; problems are collected, not thrown. */
async function loadAll<T>(store: Store, relPaths: string[], schema: import('zod').ZodType<T>): Promise<Collection<T>> {
  const items: { data: T; relPath: string }[] = [];
  const problems: string[] = [];
  for (const p of relPaths) {
    try {
      const d = await store.readDataCached(p, schema);
      if (d) items.push(d as { data: T; relPath: string });
    } catch (e) {
      if (e instanceof MentorError) problems.push(`${p}: ${e.code}`);
      else throw e;
    }
  }
  await store.flushCache();
  return { items, problems };
}

export async function loadTopics(ctx: Ctx, subject?: string): Promise<Collection<Topic>> {
  const subjects = subject ? [subject] : await ctx.store.listSubjectsIn(DIRS.knowledge);
  const paths: string[] = [];
  for (const s of subjects) paths.push(...(await ctx.store.listDocs(`${DIRS.knowledge}/${s}`)));
  return loadAll(ctx.store, paths, TopicSchema);
}

export async function loadSubjects(ctx: Ctx) {
  return loadAll(ctx.store, await ctx.store.listDocs(DIRS.subjects), SubjectSchema);
}

export async function loadPaths(ctx: Ctx, subject?: string) {
  const subjects = subject ? [subject] : await ctx.store.listSubjectsIn(DIRS.paths);
  const subjectPaths: string[] = [];
  const topicPaths: string[] = [];
  for (const s of subjects) {
    for (const p of await ctx.store.listDocs(`${DIRS.paths}/${s}`)) (p.endsWith('/_path.md') ? subjectPaths : topicPaths).push(p);
  }
  const sp = await loadAll(ctx.store, subjectPaths, SubjectPathSchema);
  const tp = await loadAll(ctx.store, topicPaths, TopicPathSchema);
  return { subjectPaths: sp, topicPaths: tp, problems: [...sp.problems, ...tp.problems] };
}

/** Sources need their key points (body), so they are read in full. */
export async function loadSources(ctx: Ctx, subject?: string) {
  const subjects = subject ? [subject] : await ctx.store.listSubjectsIn(DIRS.research);
  const items: LoadedDoc<import('../schema/index.js').Source>[] = [];
  const problems: string[] = [];
  for (const s of subjects) {
    for (const p of await ctx.store.listDocs(`${DIRS.research}/${s}`)) {
      try {
        const d = await ctx.store.readDoc(p, SourceSchema);
        if (d) items.push(d);
      } catch (e) {
        if (e instanceof MentorError) problems.push(`${p}: ${e.code}`);
        else throw e;
      }
    }
  }
  return { items, problems };
}

export async function readTopic(ctx: Ctx, subject: string, slug: string): Promise<LoadedDoc<Topic>> {
  const loaded = await ctx.store.readDoc(rel.topic(subject, slug), TopicSchema);
  if (!loaded) {
    const { items } = await loadTopics(ctx);
    const similar = items
      .map((i) => i.data.id)
      .filter((id) => id.startsWith(`${subject}/`) || id.endsWith(`/${slug}`))
      .slice(0, 5);
    throw new MentorError(
      'E_NOT_FOUND',
      `Unknown topic ${subject}/${slug}.${similar.length ? ` Similar: ${similar.join(', ')}.` : ''} Create it with mentor_upsert_topic first.`,
    );
  }
  return loaded;
}
