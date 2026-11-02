/** mentor_next recommendations (ARCHITECTURE §7.3). Pure. */
import { dayDiff } from '../core/clock.js';
import type { Stage, SubjectPath, Topic, TopicPath } from '../schema/index.js';

export interface Recommendation {
  type: 'review' | 'reinforce' | 'continue_stage' | 'misconception' | 'next_topic' | 'blocked_topic' | 'start';
  topic?: string;
  stage?: string;
  why: string;
  missing_prerequisites?: string[];
}

export interface RecommendInput {
  today: string;
  topics: Topic[];
  subjectPaths: SubjectPath[];
  topicPaths: TopicPath[];
  subject?: string;
  limit?: number;
  /** "review": only due reviews, interleaved across subjects (for review sessions). */
  focus?: 'all' | 'review';
}

export function dueReviews(topics: Topic[], today: string): { topic: Topic; overdueDays: number }[] {
  return topics
    .filter((t) => t.review && t.review.due <= today)
    .map((t) => ({ topic: t, overdueDays: dayDiff(t.review!.due, today) }))
    .sort((a, b) => b.overdueDays - a.overdueDays || a.topic.id.localeCompare(b.topic.id));
}

/**
 * Interleaves due reviews across subjects (round-robin, most overdue first within each subject):
 * mixing subjects in one session improves discrimination and retention (interleaving effect).
 */
export function interleaveBySubject<T extends { topic: Topic }>(items: T[]): T[] {
  const queues = new Map<string, T[]>();
  for (const it of items) {
    const q = queues.get(it.topic.subject) ?? [];
    q.push(it);
    queues.set(it.topic.subject, q);
  }
  const out: T[] = [];
  const subjects = [...queues.keys()];
  while (out.length < items.length) {
    for (const s of subjects) {
      const next = queues.get(s)!.shift();
      if (next) out.push(next);
    }
  }
  return out;
}

export function activeStage(path: TopicPath): Stage | undefined {
  return path.stages.find((s) => s.status === 'active');
}

export function recommend(input: RecommendInput): Recommendation[] {
  const { today, subject } = input;
  const limit = input.limit ?? 5;
  const inScope = (id: string) => !subject || id.startsWith(`${subject}/`);
  const topics = input.topics.filter((t) => inScope(t.id));
  const byId = new Map(input.topics.map((t) => [t.id, t]));
  const out: Recommendation[] = [];

  if (!topics.length && !input.subjectPaths.some((p) => !subject || p.subject === subject)) {
    return [{ type: 'start', why: 'No topics yet: ask what the learner wants to learn and plan a path.' }];
  }

  const reviewItem = ({ topic, overdueDays }: { topic: Topic; overdueDays: number }): Recommendation => ({
    type: 'review',
    topic: topic.id,
    why: overdueDays > 0 ? `Review overdue by ${overdueDays} day(s).` : 'Review due today.',
  });

  if (input.focus === 'review') {
    return interleaveBySubject(dueReviews(topics, today)).slice(0, limit).map(reviewItem);
  }

  // 1. Overdue / due reviews (max 3, interleaved across subjects).
  for (const item of interleaveBySubject(dueReviews(topics, today)).slice(0, 3)) out.push(reviewItem(item));

  // 1b. Topics that regressed recently need a reinforcement stage before new material.
  for (const t of topics) {
    // Skip if the topic's plan was already updated after the regression and has an active stage.
    const plan = input.topicPaths.find((p) => p.topic === t.id);
    const replanned = !!plan && plan.updated >= (t.regressed_on ?? '') && !!activeStage(plan);
    if (t.level === 2 && t.regressed_on && today >= t.regressed_on && !replanned) {
      out.push({ type: 'reinforce', topic: t.id, why: `A check on ${t.regressed_on} showed forgetting; insert a short reinforcement stage (mentor_plan_topic mode "insert").` });
    }
  }

  // 2. Active stage of the most recently updated topic path.
  const paths = input.topicPaths.filter((p) => inScope(p.topic)).sort((a, b) => (a.updated < b.updated ? 1 : -1));
  for (const p of paths) {
    const st = activeStage(p);
    if (st) {
      out.push({ type: 'continue_stage', topic: p.topic, stage: st.id, why: `Stage "${st.title}" is in progress (goal: ${st.goal}).` });
      break;
    }
  }

  // 3. Open misconceptions.
  for (const t of topics) {
    for (const m of t.misconceptions) {
      if (m.status === 'open' || m.status === 'recurring') {
        out.push({ type: 'misconception', topic: t.id, why: `Misconception "${m.id}" (${m.description}) is ${m.status}, seen ${m.occurrences}×.` });
      }
    }
  }

  // 4/5. Next topic in each subject path; blocked topics with missing prerequisites.
  const satisfied = (id: string) => {
    const t = byId.get(id);
    return !!t && t.level !== null && t.level >= 3;
  };
  for (const sp of input.subjectPaths.filter((p) => !subject || p.subject === subject)) {
    let proposed = false;
    for (const node of sp.topics) {
      const t = byId.get(node.id);
      if (t && t.level === 4) continue;
      if (paths.some((p) => p.topic === node.id && activeStage(p))) continue;
      const missing = node.prerequisites.filter((p) => !satisfied(p));
      if (!missing.length && !proposed) {
        out.push({ type: 'next_topic', topic: node.id, why: `Next in the ${sp.subject} path; all prerequisites are at least "partial understanding".` });
        proposed = true;
      } else if (missing.length && t?.level !== 3) {
        out.push({ type: 'blocked_topic', topic: node.id, missing_prerequisites: missing, why: `Waiting for prerequisites: ${missing.join(', ')}.` });
      }
    }
  }

  // Keep the most useful items: reviews, current stage, misconceptions, next topics, then blocked.
  const dedup = out.filter((r, i) => out.findIndex((x) => x.type === r.type && x.topic === r.topic) === i);
  const nonBlocked = dedup.filter((r) => r.type !== 'blocked_topic');
  const blocked = dedup.filter((r) => r.type === 'blocked_topic');
  return [...nonBlocked, ...blocked].slice(0, limit);
}
