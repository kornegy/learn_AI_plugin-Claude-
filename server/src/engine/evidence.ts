/** Evidence records and their normalisation (ARCHITECTURE §6.1). Pure. */
import type { EvidenceData } from '../schema/index.js';
import type { Level } from '../core/labels.js';

export interface EvidenceRecord extends EvidenceData {
  id: string;
  ts: string;
  day: string;
}

export interface OverrideRecord {
  id: string;
  ts: string;
  day: string;
  level: Level;
  reason: string;
}

export type AssessableKind = 'recognition' | 'recall' | 'explanation' | 'application' | 'transfer';

export interface NormalizedEvidence {
  kind: AssessableKind;
  success: boolean;
  independent: boolean;
  record: EvidenceRecord;
}

/** Returns null for evidence that never affects the level (exposure, self_report). */
export function normalize(e: EvidenceRecord): NormalizedEvidence | null {
  if (e.kind === 'exposure' || e.kind === 'self_report') return null;
  const assistedFlag = e.independence === 'assisted' || e.hint_level > 0;
  if (e.kind === 'application' || e.kind === 'transfer') {
    if (e.outcome === 'partial') return { kind: 'application', success: true, independent: false, record: e };
    return { kind: e.kind, success: e.outcome === 'success', independent: !assistedFlag, record: e };
  }
  // recognition, recall, explanation: partial counts as a failure for level purposes.
  return { kind: e.kind, success: e.outcome === 'success', independent: !assistedFlag, record: e };
}

export function normalizeAll(events: EvidenceRecord[]): NormalizedEvidence[] {
  const out: NormalizedEvidence[] = [];
  for (const e of events) {
    const n = normalize(e);
    if (n) out.push(n);
  }
  return out;
}

export function byTime<T extends { ts: string; id: string }>(a: T, b: T): number {
  if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function distinctDays(events: { day: string }[]): string[] {
  return [...new Set(events.map((e) => e.day))].sort();
}
