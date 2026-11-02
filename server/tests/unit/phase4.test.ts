import { describe, it, expect } from 'vitest';
import { analyze } from '../../src/engine/insights.js';
import { renderProgress, levelBar } from '../../src/engine/progress.js';
import { recommend, interleaveBySubject, dueReviews } from '../../src/engine/recommender.js';
import { buildCard } from '../../src/engine/card.js';
import { ConfigSchema, TopicSchema, TopicPathSchema, type Topic } from '../../src/schema/index.js';
import type { EvidenceRecord } from '../../src/engine/evidence.js';

let seq = 0;
function ev(topic: string, day: string, kind: EvidenceRecord['kind'], outcome: EvidenceRecord['outcome'], extra: Partial<EvidenceRecord> = {}): [string, EvidenceRecord] {
  seq++;
  return [
    topic,
    {
      id: `e${String(seq).padStart(5, '0')}`,
      ts: `${day}T10:00:${String(seq % 60).padStart(2, '0')}+00:00`,
      day,
      kind,
      outcome,
      independence: 'independent',
      hint_level: 0,
      context: 'learning',
      misconception: null,
      addresses: [],
      reported_level: null,
      note: '',
      quote: '',
      ...extra,
    },
  ];
}
const byTopic = (pairs: [string, EvidenceRecord][]) => {
  const m = new Map<string, EvidenceRecord[]>();
  for (const [t, e] of pairs) m.set(t, [...(m.get(t) ?? []), e]);
  return m;
};
function topic(id: string, extra: Partial<Topic> = {}): Topic {
  return TopicSchema.parse({ schema: 1, kind: 'topic', id, subject: id.split('/')[0], title: id.split('/')[1], created: '2026-10-01', updated: '2026-10-01', ...extra });
}
const misc = (id: string, status: 'open' | 'resolved' | 'recurring' | 'resolving' = 'open') => ({ id, description: 'confuses address and value', status, first_seen: '2026-10-01', last_seen: '2026-10-05', occurrences: 2 });
const review = (due: string) => ({ due, stability: 3, difficulty: 5, reps: 1, lapses: 0, state: 'review' as const, last_review: '2026-10-01' });
const path = (topicId: string, started: string) =>
  TopicPathSchema.parse({
    schema: 1, kind: 'topic_path', topic: topicId, goal: 'g', created: '2026-10-01', updated: started,
    stages: [{ id: 's1', title: 'Stage one', goal: 'g', status: 'active', started, criteria: [{ kind: 'recall' }] }, { id: 's2', title: 'Two', goal: 'g', criteria: [{ kind: 'recall' }] }],
  });

describe('insights', () => {
  const today = '2026-11-01';

  it('finds a misconception shared across topics and puts it first', () => {
    const topics = [topic('cpp/pointers', { misconceptions: [misc('addr-vs-value')] }), topic('cpp/references', { misconceptions: [misc('addr-vs-value')] })];
    const out = analyze({ today, topics, topicPaths: [], evidenceByTopic: new Map() });
    expect(out[0]).toMatchObject({ type: 'cross_topic_misconception', severity: 'high', topics: ['cpp/pointers', 'cpp/references'] });
    expect(out[0]!.finding).toContain('confuses address and value');
  });

  it('flags a recurring misconception, ignores resolved ones', () => {
    expect(analyze({ today, topics: [topic('cpp/a', { misconceptions: [misc('x', 'recurring')] })], topicPaths: [], evidenceByTopic: new Map() })[0]!.type).toBe('recurring_misconception');
    expect(analyze({ today, topics: [topic('cpp/a', { misconceptions: [misc('x', 'resolved')] }), topic('cpp/b', { misconceptions: [misc('x', 'resolved')] })], topicPaths: [], evidenceByTopic: new Map() })).toEqual([]);
  });

  it('traces recent failures to a weak prerequisite', () => {
    const topics = [topic('cpp/memory', { level: 2 }), topic('cpp/pointers', { level: 3, prerequisites: ['cpp/memory'] })];
    const evidence = byTopic([ev('cpp/pointers', '2026-10-28', 'application', 'fail'), ev('cpp/pointers', '2026-10-30', 'recall', 'fail')]);
    const out = analyze({ today, topics, topicPaths: [], evidenceByTopic: evidence });
    expect(out.find((i) => i.type === 'weak_prerequisite')).toMatchObject({ topics: ['cpp/pointers', 'cpp/memory'] });
    const old = byTopic([ev('cpp/pointers', '2026-09-01', 'application', 'fail'), ev('cpp/pointers', '2026-09-02', 'recall', 'fail')]);
    expect(analyze({ today, topics, topicPaths: [], evidenceByTopic: old }).find((i) => i.type === 'weak_prerequisite')).toBeUndefined();
  });

  it('detects hint dependence, regressions, stalled stages, review backlog and provisional prerequisites', () => {
    const assisted = { independence: 'assisted' as const, hint_level: 2 };
    const evidence = byTopic([
      ev('cpp/loops', '2026-10-20', 'application', 'success', assisted),
      ev('cpp/loops', '2026-10-22', 'application', 'success', assisted),
      ev('cpp/loops', '2026-10-24', 'application', 'partial'),
    ]);
    const topics = [
      topic('cpp/loops', { level: 3 }),
      topic('cpp/vars', { level: 3, provisional: true }),
      topic('cpp/funcs', { level: 2, regressed_on: '2026-10-25', prerequisites: ['cpp/vars'] }),
      ...['a', 'b', 'c', 'd', 'e'].map((x) => topic(`sql/${x}`, { level: 3, review: review('2026-10-20') })),
    ];
    const types = analyze({ today, topics, topicPaths: [path('cpp/funcs', '2026-10-10')], evidenceByTopic: evidence }).map((i) => i.type);
    expect(types).toEqual(expect.arrayContaining(['hint_dependence', 'regression', 'stalled_stage', 'review_backlog', 'probe_provisional']));
  });

  it('respects the subject filter', () => {
    const topics = [topic('cpp/a', { misconceptions: [misc('x')] }), topic('cpp/b', { misconceptions: [misc('x')] })];
    expect(analyze({ today, topics, topicPaths: [], evidenceByTopic: new Map(), subject: 'sql' })).toEqual([]);
  });
});

describe('reviews and adaptation', () => {
  it('interleaves due reviews across subjects', () => {
    const topics = [
      topic('cpp/a', { level: 3, review: review('2026-10-01') }),
      topic('cpp/b', { level: 3, review: review('2026-10-02') }),
      topic('sql/c', { level: 3, review: review('2026-10-10') }),
      topic('cpp/d', { level: 3, review: review('2026-10-03') }),
      topic('sql/e', { level: 3, review: review('2026-10-11') }),
    ];
    expect(interleaveBySubject(dueReviews(topics, '2026-11-01')).map((d) => d.topic.id)).toEqual(['cpp/a', 'sql/c', 'cpp/b', 'sql/e', 'cpp/d']);
    const recs = recommend({ today: '2026-11-01', topics, subjectPaths: [], topicPaths: [], focus: 'review', limit: 4 });
    expect(recs.map((r) => r.topic)).toEqual(['cpp/a', 'sql/c', 'cpp/b', 'sql/e']);
    expect(recs.every((r) => r.type === 'review')).toBe(true);
  });

  it('recommends reinforcement after a regression until the plan is updated', () => {
    const t = topic('cpp/funcs', { level: 2, regressed_on: '2026-10-25' });
    expect(recommend({ today: '2026-11-01', topics: [t], subjectPaths: [], topicPaths: [] })[0]).toMatchObject({ type: 'reinforce', topic: 'cpp/funcs' });
    const replanned = path('cpp/funcs', '2026-10-26');
    expect(recommend({ today: '2026-11-01', topics: [t], subjectPaths: [], topicPaths: [replanned] }).some((r) => r.type === 'reinforce')).toBe(false);
  });
});

describe('progress map', () => {
  it('renders level bars, current stage, reviews, misconceptions and missing prerequisites', () => {
    const topics = [
      topic('cpp/variables', { level: 4, title: 'Переменные' }),
      topic('cpp/pointers', { level: 3, provisional: true, misconceptions: [misc('addr-vs-value')], review: review('2026-10-20') }),
      topic('cpp/references'),
      topic('cpp/extra', { level: 1 }),
    ];
    const map = renderProgress({
      subject: 'cpp',
      subjectDoc: null,
      path: {
        schema: 1, kind: 'subject_path', subject: 'cpp', goal: 'Systems programming', created: '2026-10-01', updated: '2026-10-01',
        topics: [
          { id: 'cpp/variables', prerequisites: [] },
          { id: 'cpp/pointers', prerequisites: ['cpp/variables'] },
          { id: 'cpp/references', prerequisites: ['cpp/pointers', 'cpp/variables'] },
        ],
      },
      topics,
      topicPaths: [path('cpp/pointers', '2026-10-28')],
      today: '2026-11-01',
      lang: 'en',
    });
    const lines = map.split('\n');
    expect(lines[0]).toBe('cpp — Systems programming');
    expect(lines[1]).toMatch(/^████ 4\s+variables\s+Solid$/);
    expect(lines[2]).toMatch(/^███░ 3\? pointers .*▶ 1\/2 Stage one ↻ ⚠ addr-vs-value$/);
    expect(lines[3]).toMatch(/^···· –\s+references .*Not assessed$/); // pointers is level 3, so nothing is missing
    expect(map).toContain('Outside the path:');
    expect(map).toContain('Total: 1 solid · 1 partial · 0 reinforce · 1 new · 1 not assessed');
    expect(levelBar(2)).toBe('██░░');
  });
});

describe('card additions', () => {
  it('shows the last session summary, the planned next step and high-severity insights as quoted data', () => {
    const card = buildCard({
      now: new Date('2026-11-01T12:00:00Z'),
      workspace: null,
      config: ConfigSchema.parse({}),
      profile: null,
      preferences: null,
      subjects: [],
      topics: [topic('cpp/a', { level: 3 })],
      subjectPaths: [],
      topicPaths: [],
      lastSession: { day: '2026-10-30', notes: [], summary: 'Practised *p; struggled with p vs *p', next_step: 'Pointers in functions' },
      problems: [],
      insights: [
        { type: 'cross_topic_misconception', severity: 'high', topics: ['cpp/a', 'cpp/b'], finding: 'Misconception "x" appears in 2 topics', suggestion: 's' },
        { type: 'stalled_stage', severity: 'low', topics: ['cpp/a'], finding: 'low one', suggestion: 's' },
      ],
    });
    expect(card).toContain('Last session summary: "Practised *p; struggled with p vs *p"');
    expect(card).toContain('Planned next step: "Pointers in functions"');
    expect(card).toContain(`Insight: "Misconception 'x' appears in 2 topics"`);
    expect(card).not.toContain('low one');
  });
});
