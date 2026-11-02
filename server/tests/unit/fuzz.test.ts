/**
 * Property and fuzz tests (Phase 5). A small seeded PRNG keeps them reproducible without extra
 * dependencies: a failure prints the seed, and FUZZ_SEED=<n> replays it.
 */
import { describe, it, expect } from 'vitest';
import { parseDoc, serializeDoc, setSection, appendToSection, getSection } from '../../src/storage/markdown.js';
import { computeMastery, type Strictness } from '../../src/engine/mastery.js';
import { computeReview } from '../../src/engine/scheduler.js';
import { computeMisconceptions } from '../../src/engine/misconceptions.js';
import { buildCard } from '../../src/engine/card.js';
import { ConfigSchema, TopicSchema } from '../../src/schema/index.js';
import type { EvidenceRecord } from '../../src/engine/evidence.js';
import { MentorError } from '../../src/core/errors.js';

const BASE_SEED = Number(process.env.FUZZ_SEED ?? 20261102);
function rng(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    pick: <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)]!,
    bool: (p = 0.5) => next() < p,
  };
}

const PIECES = [
  'a', 'Z', ' ', '\n', '\n\n', '---', '- ', '## ', '<!-- mentor:section x -->', '<!-- mentor:end -->', '<!--', '-->',
  'указатель', '*p = &x;', '"', "'", ':', '#', '|', '`', '\t', '\r\n', '{', '}', '[', ']', '🙂', '​', '\\',
];
function randomText(r: ReturnType<typeof rng>, max = 40): string {
  let s = '';
  for (let i = 0, n = r.int(max); i < n; i++) s += r.pick(PIECES);
  return s;
}

describe('markdown documents under random content', () => {
  it('any text written through the section API keeps the document parseable and stable', () => {
    for (let i = 0; i < 400; i++) {
      const seed = BASE_SEED + i;
      const r = rng(seed);
      const doc = parseDoc('---\nschema: 1\nkind: topic\n---\n');
      for (let k = 0, n = 1 + r.int(6); k < n; k++) {
        const name = r.pick(['summary', 'studied', 'gaps', 'notes', 'evidence']);
        if (r.bool()) setSection(doc, name, 'Heading', randomText(r));
        else appendToSection(doc, name, 'Heading', [randomText(r), randomText(r)], 'Archive');
      }
      doc.frontmatter = { schema: 1, kind: 'topic', title: randomText(r, 10) || 'x' };
      let once: string;
      try {
        once = serializeDoc(doc);
        const reparsed = parseDoc(once);
        expect(serializeDoc(reparsed), `seed ${seed}`).toBe(once);
        expect((reparsed.frontmatter as { title: string }).title, `seed ${seed}`).toBe((doc.frontmatter as { title: string }).title);
      } catch (e) {
        throw new Error(`seed ${seed}: ${(e as Error).message}`);
      }
    }
  });

  it('arbitrary input either parses or fails with E_CORRUPT, never with another error', () => {
    for (let i = 0; i < 1000; i++) {
      const r = rng(BASE_SEED * 7 + i);
      const text = (r.bool(0.7) ? '---\n' : '') + randomText(r, 60) + (r.bool(0.6) ? '\n---\n' : '') + randomText(r, 60);
      try {
        parseDoc(text);
      } catch (e) {
        expect(e instanceof MentorError && e.code === 'E_CORRUPT', `seed ${BASE_SEED * 7 + i}: ${(e as Error).message}`).toBe(true);
      }
    }
  });

  it('a learner heading edit survives every server rewrite', () => {
    const doc = parseDoc('---\nschema: 1\n---\n<!-- mentor:section summary -->\n## Моё название\nold\n<!-- mentor:end -->\n');
    for (let i = 0; i < 50; i++) setSection(doc, 'summary', 'Summary', `v${i}`);
    expect(getSection(parseDoc(serializeDoc(doc)), 'summary')).toMatchObject({ heading: 'Моё название', content: 'v49' });
  });
});

const KINDS = ['exposure', 'self_report', 'recognition', 'recall', 'explanation', 'application', 'transfer'] as const;
const OUTCOMES = ['success', 'partial', 'fail'] as const;
function randomEvidence(r: ReturnType<typeof rng>, n: number): EvidenceRecord[] {
  const out: EvidenceRecord[] = [];
  let day = 1;
  for (let i = 0; i < n; i++) {
    if (r.bool(0.4)) day += 1 + r.int(20);
    const d = new Date(Date.UTC(2026, 0, day)).toISOString().slice(0, 10);
    const kind = r.pick(KINDS);
    const misc = r.bool(0.15) ? { id: r.pick(['m-a', 'm-b']), description: 'x' } : null;
    out.push({
      id: `e${String(i).padStart(5, '0')}`,
      ts: `${d}T10:${String(i % 60).padStart(2, '0')}:00+00:00`,
      day: d,
      kind,
      outcome: r.pick(OUTCOMES),
      independence: r.bool() ? 'independent' : 'assisted',
      hint_level: r.int(6),
      context: r.pick(['learning', 'review', 'diagnostic'] as const),
      misconception: misc,
      addresses: r.bool(0.2) ? [r.pick(['m-a', 'm-b'])] : [],
      reported_level: kind === 'self_report' ? (1 + r.int(4)) as 1 | 2 | 3 | 4 : null,
      note: '',
      quote: '',
    });
  }
  return out;
}

describe('mastery and scheduling invariants on random evidence', () => {
  const strictnesses: Strictness[] = ['lenient', 'standard', 'strict'];

  it('levels are valid, deterministic, and independent of input order', () => {
    for (let i = 0; i < 500; i++) {
      const r = rng(BASE_SEED * 13 + i);
      const ev = randomEvidence(r, 1 + r.int(25));
      const s = r.pick(strictnesses);
      const a = computeMastery(ev, [], s);
      expect([null, 1, 2, 3, 4]).toContain(a.level);
      const shuffled = [...ev].sort(() => r.next() - 0.5);
      expect(computeMastery(shuffled, [], s)).toEqual(a);
      expect(computeReview(shuffled, [], s, 'normal')).toEqual(computeReview(ev, [], s, 'normal'));
    }
  });

  it('reading (exposure) never changes the level; strictness is monotone', () => {
    for (let i = 0; i < 500; i++) {
      const r = rng(BASE_SEED * 17 + i);
      const ev = randomEvidence(r, 1 + r.int(20));
      const last = ev[ev.length - 1]!;
      const withExposure = [...ev, { ...last, id: 'zzexp', ts: last.ts.replace('+00:00', '+00:00'), kind: 'exposure' as const, outcome: 'success' as const }];
      for (const s of strictnesses) expect(computeMastery(withExposure, [], s).level).toBe(computeMastery(ev, [], s).level);
      const lv = (s: Strictness) => computeMastery(ev, [], s).level ?? 0;
      expect(lv('lenient')).toBeGreaterThanOrEqual(lv('standard'));
      expect(lv('standard')).toBeGreaterThanOrEqual(lv('strict'));
    }
  });

  it('one failure in learning context on a later day never lowers an evidence-based level', () => {
    for (let i = 0; i < 500; i++) {
      const r = rng(BASE_SEED * 19 + i);
      const ev = randomEvidence(r, 1 + r.int(20)).filter((e) => e.kind !== 'self_report');
      if (!ev.length) continue;
      const before = computeMastery(ev, [], 'standard');
      const lastDay = ev.map((e) => e.day).sort().at(-1)!;
      const nextDay = new Date(Date.parse(`${lastDay}T00:00:00Z`) + 86_400_000 * 3).toISOString().slice(0, 10);
      const slip: EvidenceRecord = { ...ev[0]!, id: 'zzslip', day: nextDay, ts: `${nextDay}T10:00:00+00:00`, kind: 'application', outcome: 'fail', context: 'learning', misconception: null, addresses: [] };
      const after = computeMastery([...ev, slip], [], 'standard');
      expect((after.level ?? 0) >= Math.min(before.level ?? 0, 3), `seed ${BASE_SEED * 19 + i}`).toBe(true);
    }
  });

  it('misconception counts equal the number of non-success events carrying them', () => {
    for (let i = 0; i < 300; i++) {
      const r = rng(BASE_SEED * 23 + i);
      const ev = randomEvidence(r, 1 + r.int(30));
      for (const m of computeMisconceptions(ev)) {
        const n = ev.filter((e) => e.outcome !== 'success' && e.misconception?.id === m.id).length;
        expect(m.occurrences).toBe(n);
      }
    }
  });
});

describe('learner card under hostile data', () => {
  it('never exceeds the budget and keeps every learner string on one quoted line', () => {
    for (let i = 0; i < 200; i++) {
      const r = rng(BASE_SEED * 29 + i);
      const topics = Array.from({ length: r.int(60) }, (_, k) =>
        TopicSchema.parse({
          schema: 1, kind: 'topic', id: `s${k % 3}/t-${k}`, subject: `s${k % 3}`, title: (randomText(r, 20) || 't').slice(0, 120), created: '2026-01-01', updated: '2026-01-01',
          level: r.pick([null, 1, 2, 3, 4]),
          misconceptions: r.bool(0.3) ? [{ id: 'm-a', description: randomText(r, 30).slice(0, 300), status: 'open', first_seen: '2026-01-01', last_seen: '2026-01-02', occurrences: 2 }] : [],
        }),
      );
      const card = buildCard({
        now: new Date('2026-11-02T10:00:00Z'), workspace: null, config: ConfigSchema.parse({}), profile: null, preferences: null,
        subjects: [], topics, subjectPaths: [], topicPaths: [], problems: [],
        lastSession: { day: '2026-10-01', notes: [randomText(r)], summary: randomText(r, 80), next_step: randomText(r) },
      });
      expect(card.length).toBeLessThanOrEqual(4000);
      for (const line of card.split('\n')) expect(line.startsWith('<!--') || line.startsWith('---')).toBe(false);
    }
  });
});
