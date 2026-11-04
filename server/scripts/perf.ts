/**
 * Performance probe on a large learner: N topics, M evidence events.
 *   node scripts/run-ts.mjs scripts/perf.ts <root> [topics=1000] [eventsPerTopic=20]
 * Prints timings of the operations that run on every session or every recorded answer.
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fixedClock } from '../src/core/clock.js';
import { Mentor } from '../src/services/mentor.js';
import { ulid } from '../src/core/ids.js';

const root = path.resolve(process.argv[2] ?? 'perf-data');
const topicsN = Number(process.argv[3] ?? 1000);
const perTopic = Number(process.argv[4] ?? 20);
await fs.rm(root, { recursive: true, force: true });
const clock = fixedClock('2026-01-01T10:00:00Z');
const m = new Mentor(root, clock);
await m.init({});

const t0 = performance.now();
const subjects = ['cpp', 'sql', 'os', 'algorithms', 'networks'];
const topics = Array.from({ length: topicsN }, (_, i) => ({ topic_id: `${subjects[i % 5]}/topic-${i}`, title: `Topic ${i}` }));
for (const s of subjects) await m.planPath({ subject: s, goal: 'g', create_missing: true, topics: topics.filter((t) => t.topic_id.startsWith(`${s}/`)) });
// Write the bulk of the evidence directly to the journal (fast), then project once via doctor.
const lines: Record<string, string[]> = {};
let n = 0;
for (let d = 0; d < perTopic; d++) {
  for (const t of topics) {
    const day = new Date(Date.UTC(2026, 0, 1 + d * 3)).toISOString().slice(0, 10);
    const ev = { v: 1, id: ulid(new Date(Date.UTC(2026, 0, 1 + d * 3, 10, 0, n % 60))), ts: `${day}T10:00:00+00:00`, day, type: 'evidence_recorded', subject: t.topic_id.split('/')[0], topic: t.topic_id,
      data: { kind: d % 3 === 0 ? 'explanation' : 'application', outcome: d % 7 === 0 ? 'fail' : 'success', independence: 'independent', hint_level: 0, context: d % 2 ? 'review' : 'learning', misconception: null, addresses: [], reported_level: null, note: 'n', quote: '' } };
    (lines[day.slice(0, 7)] ??= []).push(JSON.stringify(ev));
    n++;
  }
}
for (const [month, ls] of Object.entries(lines)) await fs.appendFile(path.join(root, '.mentor/journal', `${month}.jsonl`), ls.join('\n') + '\n');
const tSetup = performance.now();
clock.set('2026-06-01T10:00:00Z');
const time = async (label: string, fn: () => Promise<unknown>) => {
  const s = performance.now();
  await fn();
  const ms = performance.now() - s;
  process.stdout.write(`${label.padEnd(34)} ${ms.toFixed(0).padStart(7)} ms\n`);
  return ms;
};
process.stdout.write(`topics=${topicsN} events=${n} setup=${((tSetup - t0) / 1000).toFixed(1)} s\n`);
await time('doctor repair (rebuild all topics)', () => m.data.doctor({ repair: true }));
await time('get_context (card)', () => m.getContext({ cwd: root }));
await time('record_evidence', () => m.recordEvidence({ topic_id: topics[0]!.topic_id, events: [{ kind: 'recall', outcome: 'success' }] }));
await time('insights', () => m.insights({}));
await time('progress (all subjects)', () => m.progress({}));
await time('next', () => m.next({}));
await time('find_topics', () => m.findTopics({ query: 'topic 42' }));
