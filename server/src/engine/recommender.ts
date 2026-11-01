/** mentor_next recommendations (ARCHITECTURE §7.3). Pure. */
import { dayDiff } from '../core/clock.js';
import type { Stage, SubjectPath, Topic, TopicPath } from '../schema/index.js';

export interface Recommendation {
  type: 'review' | 'continue_stage' | 'misconception' | 'next_topic' | 'blocked_topic' | 'start';
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
}

export function dueReviews(topics: Topic[], today: string): { topic: Topic; overdueDays: number }[] {
  return topics
    .filter((t) => t.review && t.review.due <= today)
    .map((t) => ({ topic: t, overdueDays: dayDiff(t.review!.due, today) }))
    .sort((a, b) => b.overdueDays - a.overdueDays || a.topic.id.localeCompare(b.topic.id));
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

  // 1. Overdue / due reviews (max 3).
  for (const { topic, overdueDays } of dueReviews(topics, today).slice(0, 3)) {
    out.push({
      type: 'review',
      topic: topic.id,
      why: overdueDays > 0 ? `Review overdue by ${overdueDays} day(s).` : 'Review due today.',
    });
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
