/** Misconception state machine (ARCHITECTURE §6.5). Pure. */
import type { Misconception } from '../schema/index.js';
import { byTime, type EvidenceRecord } from './evidence.js';

const ADDRESSING_KINDS = new Set(['explanation', 'application', 'transfer']);

export function computeMisconceptions(events: EvidenceRecord[]): Misconception[] {
  const map = new Map<string, Misconception & { resolvingDay?: string }>();
  for (const e of [...events].sort(byTime)) {
    if (e.outcome !== 'success' && e.misconception) {
      const { id, description } = e.misconception;
      const m = map.get(id);
      if (!m) {
        map.set(id, { id, description, status: 'open', first_seen: e.day, last_seen: e.day, occurrences: 1 });
      } else {
        m.occurrences += 1;
        m.last_seen = e.day;
        if (description && !m.description) m.description = description;
        if (m.status === 'resolved') m.status = 'recurring';
        else if (m.status === 'resolving') m.status = 'open';
        delete m.resolvingDay;
      }
      continue;
    }
    if (e.outcome === 'success' && ADDRESSING_KINDS.has(e.kind)) {
      for (const id of e.addresses) {
        const m = map.get(id);
        if (!m) continue;
        if (m.status === 'open' || m.status === 'recurring') {
          m.status = 'resolving';
          m.resolvingDay = e.day;
        } else if (m.status === 'resolving' && m.resolvingDay !== e.day) {
          m.status = 'resolved';
          delete m.resolvingDay;
        }
      }
    }
  }
  return [...map.values()].map(({ resolvingDay: _r, ...m }) => m);
}

export function hasOpenMisconception(list: Misconception[]): boolean {
  return list.some((m) => m.status === 'open' || m.status === 'recurring');
}
