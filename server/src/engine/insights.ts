/**
 * Learning insights: patterns across topics that a mentor should act on (Phase 4: deeper
 * analysis of understanding and errors). Pure: all data is passed in.
 */
import { dayDiff } from '../core/clock.js';
import type { Topic, TopicPath } from '../schema/index.js';
import { normalizeAll, type EvidenceRecord } from './evidence.js';
import { activeStage, dueReviews } from './recommender.js';

export type InsightType =
  | 'cross_topic_misconception'
  | 'recurring_misconception'
  | 'weak_prerequisite'
  | 'regression'
  | 'hint_dependence'
  | 'stalled_stage'
  | 'review_backlog'
  | 'probe_provisional';

export interface Insight {
  type: InsightType;
  severity: 'high' | 'medium' | 'low';
  topics: string[];
  finding: string;
  suggestion: string;
}

export interface InsightInput {
  today: string;
  topics: Topic[];
  topicPaths: TopicPath[];
  evidenceByTopic: Map<string, EvidenceRecord[]>;
  subject?: string;
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;
const RECENT_DAYS = 14;

export function analyze(input: InsightInput): Insight[] {
  const { today } = input;
  const inScope = (id: string) => !input.subject || id.startsWith(`${input.subject}/`);
  const topics = input.topics.filter((t) => inScope(t.id));
  const byId = new Map(input.topics.map((t) => [t.id, t]));
  const out: Insight[] = [];

  // 1. The same wrong belief shows up in several topics → one root idea to fix.
  const misc = new Map<string, { desc: string; topics: string[]; open: boolean; recurring: boolean }>();
  for (const t of topics) {
    for (const m of t.misconceptions) {
      const cur = misc.get(m.id) ?? { desc: m.description, topics: [], open: false, recurring: false };
      cur.topics.push(t.id);
      if (m.status !== 'resolved') cur.open = true;
      if (m.status === 'recurring') cur.recurring = true;
      misc.set(m.id, cur);
    }
  }
  for (const [id, m] of misc) {
    if (m.topics.length >= 2 && m.open) {
      out.push({
        type: 'cross_topic_misconception',
        severity: 'high',
        topics: m.topics,
        finding: `Misconception "${id}" (${m.desc}) appears in ${m.topics.length} topics: ${m.topics.join(', ')}.`,
        suggestion: 'Address the shared idea once, explicitly (contrast the right and wrong model), then re-check each topic with one question.',
      });
    } else if (m.recurring) {
      out.push({
        type: 'recurring_misconception',
        severity: 'high',
        topics: m.topics,
        finding: `Misconception "${id}" (${m.desc}) came back after it had been resolved.`,
        suggestion: 'Use a new representation (diagram, concrete trace) rather than repeating the earlier explanation; ask the learner to explain why the wrong model fails.',
      });
    }
  }

  // 2. Recent failures on a topic whose prerequisite is weak → the gap is probably below.
  for (const t of topics) {
    const recentFails = (input.evidenceByTopic.get(t.id) ?? []).filter(
      (e) => e.outcome !== 'success' && e.kind !== 'exposure' && dayDiff(e.day, today) <= RECENT_DAYS,
    );
    if (recentFails.length < 2) continue;
    const weak = t.prerequisites.filter((p) => {
      const pt = byId.get(p);
      return !pt || pt.level === null || pt.level <= 2 || pt.provisional;
    });
    if (weak.length) {
      out.push({
        type: 'weak_prerequisite',
        severity: 'high',
        topics: [t.id, ...weak],
        finding: `${recentFails.length} recent failures on ${t.id}, and its prerequisite(s) ${weak.join(', ')} are not solid.`,
        suggestion: `Check ${weak[0]} with one retrieval question before continuing ${t.id}.`,
      });
    }
  }

  // 3. Regressions in the last 30 days.
  for (const t of topics) {
    if (t.regressed_on && dayDiff(t.regressed_on, today) <= 30 && t.level === 2) {
      out.push({
        type: 'regression',
        severity: 'medium',
        topics: [t.id],
        finding: `${t.id} dropped to "needs reinforcement" after a failed check on ${t.regressed_on}.`,
        suggestion: 'Insert a short reinforcement stage (retrieval first, then one application) before new material in this topic.',
      });
    }
  }

  // 4. Solves only with hints → fade assistance.
  for (const t of topics) {
    const apps = normalizeAll(input.evidenceByTopic.get(t.id) ?? []).filter((e) => e.kind === 'application' && e.success);
    if (apps.length >= 3 && apps.every((e) => !e.independent)) {
      out.push({
        type: 'hint_dependence',
        severity: 'medium',
        topics: [t.id],
        finding: `All ${apps.length} successful applications on ${t.id} needed hints.`,
        suggestion: 'Fade assistance: ask for a full attempt first, give at most a rung-1 hint, and praise the attempt rather than the result.',
      });
    }
  }

  // 5. A stage active for more than 14 days.
  for (const p of input.topicPaths.filter((p) => inScope(p.topic))) {
    const st = activeStage(p);
    if (st?.started && dayDiff(st.started, today) > RECENT_DAYS) {
      out.push({
        type: 'stalled_stage',
        severity: 'low',
        topics: [p.topic],
        finding: `Stage "${st.title}" of ${p.topic} has been active since ${st.started} (${dayDiff(st.started, today)} days).`,
        suggestion: 'Ask what feels hard about it; consider splitting the stage into smaller steps or revisiting its prerequisite.',
      });
    }
  }

  // 6. Many reviews due.
  const due = dueReviews(topics, today);
  if (due.length >= 5) {
    out.push({
      type: 'review_backlog',
      severity: 'medium',
      topics: due.map((d) => d.topic.id),
      finding: `${due.length} reviews are due.`,
      suggestion: 'Offer short, interleaved review sessions (3-5 questions) before new material.',
    });
  }

  // 7. Provisional levels that the current plan depends on.
  const upcoming = new Set<string>();
  for (const p of input.topicPaths) if (activeStage(p)) for (const pre of byId.get(p.topic)?.prerequisites ?? []) upcoming.add(pre);
  const toProbe = topics.filter((t) => t.provisional && t.level !== null && t.level >= 3 && upcoming.has(t.id)).map((t) => t.id);
  if (toProbe.length) {
    out.push({
      type: 'probe_provisional',
      severity: 'low',
      topics: toProbe,
      finding: `Current work builds on provisional levels: ${toProbe.join(', ')}.`,
      suggestion: 'Confirm each with one quick application question when it becomes relevant.',
    });
  }

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
