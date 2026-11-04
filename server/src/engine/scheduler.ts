/**
 * Review scheduling with FSRS (ARCHITECTURE §7.1), replayed from evidence so it is
 * deterministic (fuzz off, day-granular). Pure.
 */
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from 'ts-fsrs';
import { dayToInstant, instantToDay } from '../core/clock.js';
import type { Review } from '../schema/index.js';
import { byTime, distinctDays, normalize, type EvidenceRecord, type OverrideRecord } from './evidence.js';
import { computeMastery, type Strictness } from './mastery.js';

export const RETENTION = { light: 0.85, normal: 0.9, intensive: 0.95 } as const;
export type ReviewIntensity = keyof typeof RETENTION;

const QUALIFYING = new Set(['recall', 'explanation', 'application', 'transfer']);
const STATE_NAMES: Record<State, Review['state']> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

export function ratingFor(e: EvidenceRecord): Grade {
  const n = normalize(e);
  if (!n || !n.success) return Rating.Again;
  if (!n.independent) return Rating.Hard;
  return n.kind === 'transfer' ? Rating.Easy : Rating.Good;
}

function toReview(card: Card): Review {
  return {
    due: instantToDay(card.due),
    stability: Math.round(card.stability * 100) / 100,
    difficulty: Math.round(card.difficulty * 100) / 100,
    reps: card.reps,
    lapses: card.lapses,
    state: STATE_NAMES[card.state],
    last_review: card.last_review ? instantToDay(card.last_review) : null,
  };
}

export function computeReview(
  evidence: EvidenceRecord[],
  overrides: OverrideRecord[],
  strictness: Strictness,
  intensity: ReviewIntensity,
): Review | null {
  const scheduler = fsrs(generatorParameters({ request_retention: RETENTION[intensity], enable_fuzz: false, enable_short_term: false }));
  const events = [...evidence].sort(byTime);
  let card: Card | null = null;
  for (const day of distinctDays(events)) {
    const qualifying = events.filter((e) => e.day === day && QUALIFYING.has(e.kind));
    if (!card) {
      // Reviews start only from demonstrated understanding, never from a self-report or override alone.
      const m = computeMastery(events.filter((e) => e.day <= day), overrides, strictness);
      if (m.source !== 'evidence' || m.level === null || m.level < 3) continue;
      const fresh: Card = createEmptyCard(dayToInstant(day));
      const first = qualifying.find((e) => e.context === 'review') ?? qualifying[0];
      card = first ? scheduler.next(fresh, dayToInstant(day), ratingFor(first)).card : fresh;
      continue;
    }
    if (!qualifying.length) continue;
    const reviewEvent = qualifying.find((e) => e.context === 'review');
    const isDue = day >= instantToDay(card.due);
    if (!reviewEvent && !isDue) continue;
    card = scheduler.next(card, dayToInstant(day), ratingFor(reviewEvent ?? qualifying[0]!)).card;
  }
  return card ? toReview(card) : null;
}
