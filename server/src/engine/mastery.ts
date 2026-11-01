/**
 * Mastery engine (ARCHITECTURE §6): level = f(evidence, overrides, strictness).
 * Pure and deterministic, so files can always be rebuilt from the journal.
 */
import type { Level } from '../core/labels.js';
import { byTime, distinctDays, normalizeAll, type EvidenceRecord, type NormalizedEvidence, type OverrideRecord } from './evidence.js';
import { computeMisconceptions, hasOpenMisconception } from './misconceptions.js';

export type Strictness = 'lenient' | 'standard' | 'strict';

export interface MasteryResult {
  level: Level | null;
  provisional: boolean;
  source: 'evidence' | 'self_report' | 'override' | 'none';
  regressedOn: string | null;
}

const WEIGHTS = { recognition: 1, recall: 2, explanation: 3, assistedApplication: 3, independentApplication: 5, transfer: 6 };
const PROVISIONAL_THRESHOLD: Record<Strictness, number> = { lenient: 3, standard: 5, strict: 8 };

function levelFourRule(strictness: Strictness, hasExpl: boolean, indepAppDays: number, hasTransfer: boolean): boolean {
  switch (strictness) {
    case 'lenient':
      return hasExpl && (indepAppDays >= 1 || hasTransfer);
    case 'standard':
      return hasExpl && (indepAppDays >= 2 || hasTransfer);
    case 'strict':
      return hasExpl && indepAppDays >= 2 && hasTransfer;
  }
}

/** base(E) from ARCHITECTURE §6.2. `openMisc` caps the level at 3. */
export function baseLevel(events: NormalizedEvidence[], strictness: Strictness, openMisc: boolean): Level | null {
  const ok = events.filter((e) => e.success);
  const hasExpl = ok.some((e) => e.kind === 'explanation');
  const hasTransfer = ok.some((e) => e.kind === 'transfer');
  const indepAppDays = new Set(ok.filter((e) => e.kind === 'application' && e.independent).map((e) => e.record.day)).size;
  const assistedApp = ok.some((e) => e.kind === 'application' && !e.independent);
  if (levelFourRule(strictness, hasExpl, indepAppDays, hasTransfer) && !openMisc) return 4;
  if (hasExpl || assistedApp || indepAppDays >= 1 || hasTransfer) return 3;
  if (ok.some((e) => e.kind === 'recall' || e.kind === 'recognition')) return 2;
  if (events.length) return 1;
  return null;
}

const DEMONSTRATION = new Set(['recall', 'explanation', 'application', 'transfer']);

function levelGivenRegression(
  events: NormalizedEvidence[],
  raw: EvidenceRecord[],
  regressedOn: string | null,
  strictness: Strictness,
): Level | null {
  const openMisc = hasOpenMisconception(computeMisconceptions(raw));
  if (!regressedOn) return baseLevel(events, strictness, openMisc);
  const after = events.filter((e) => e.record.day > regressedOn);
  const earlierExplanations = events.filter((e) => e.record.day <= regressedOn && e.success && e.kind === 'explanation');
  const r = baseLevel([...after, ...earlierExplanations], strictness, openMisc);
  const reDemonstrated = after.some((e) => e.success && DEMONSTRATION.has(e.kind));
  return r !== null && r >= 3 && reDemonstrated ? r : 2;
}

function isRegressionDay(dayEvents: NormalizedEvidence[]): boolean {
  const checks = dayEvents.filter((e) => e.record.context === 'review' || e.record.context === 'diagnostic');
  const fails = checks.filter((e) => !e.success);
  if (fails.length >= 2) return true;
  const core = (e: NormalizedEvidence) => e.kind === 'recall' || e.kind === 'application';
  return fails.some(core) && !checks.some((e) => e.success && core(e));
}

function provisional(events: NormalizedEvidence[], strictness: Strictness): boolean {
  let sum = 0;
  for (const e of events) {
    if (!e.success) continue;
    if (e.kind === 'application') sum += e.independent ? WEIGHTS.independentApplication : WEIGHTS.assistedApplication;
    else sum += WEIGHTS[e.kind];
  }
  return sum < PROVISIONAL_THRESHOLD[strictness];
}

export function computeMastery(evidence: EvidenceRecord[], overrides: OverrideRecord[], strictness: Strictness): MasteryResult {
  const raw = [...evidence].sort(byTime);
  const events = normalizeAll(raw);

  // Manual override wins until newer assessable evidence arrives (§6.6).
  const lastOverride = [...overrides].sort(byTime).at(-1);
  if (lastOverride && !events.some((e) => e.record.ts > lastOverride.ts)) {
    return { level: lastOverride.level, provisional: false, source: 'override', regressedOn: null };
  }

  if (!events.length) {
    const lastSelf = raw.filter((e) => e.kind === 'self_report' && e.reported_level !== null).at(-1);
    if (lastSelf) return { level: lastSelf.reported_level, provisional: true, source: 'self_report', regressedOn: null };
    return { level: null, provisional: false, source: 'none', regressedOn: null };
  }

  // Walk days in order, tracking the latest regression day (§6.3).
  let regressedOn: string | null = null;
  for (const day of distinctDays(events.map((e) => e.record))) {
    const before = events.filter((e) => e.record.day < day);
    const beforeRaw = raw.filter((e) => e.day < day);
    const levelBefore = levelGivenRegression(before, beforeRaw, regressedOn, strictness);
    if (levelBefore !== null && levelBefore >= 3 && isRegressionDay(events.filter((e) => e.record.day === day))) {
      regressedOn = day;
    }
  }

  const level = levelGivenRegression(events, raw, regressedOn, strictness);
  return { level, provisional: provisional(events, strictness), source: 'evidence', regressedOn };
}

/** Counts of evidence kinds for the topic digest. */
export function evidenceCounts(evidence: EvidenceRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of evidence) if (e.kind !== 'exposure') counts[e.kind] = (counts[e.kind] ?? 0) + 1;
  return counts;
}
