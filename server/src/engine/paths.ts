/** Learning paths: prerequisite DAG and stage criteria (ARCHITECTURE §7.2). Pure. */
import { MentorError } from '../core/errors.js';
import type { Criterion, Stage } from '../schema/index.js';
import { normalize, type EvidenceRecord } from './evidence.js';

export interface DagNode {
  id: string;
  prerequisites: string[];
}

/**
 * Validates the prerequisite graph and returns a topological order that keeps the given order
 * wherever possible. Throws E_CYCLE with the cycle, or E_INVALID_INPUT for unknown ids.
 */
export function topologicalOrder(nodes: DagNode[], known: Set<string> = new Set()): string[] {
  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length) throw new MentorError('E_INVALID_INPUT', 'The path lists the same topic more than once.');
  for (const n of nodes) {
    for (const p of n.prerequisites) {
      if (p === n.id) throw new MentorError('E_CYCLE', `Topic ${n.id} lists itself as a prerequisite.`, { cycle: [n.id, n.id] });
      if (!ids.has(p) && !known.has(p)) {
        throw new MentorError('E_INVALID_INPUT', `Prerequisite ${p} of ${n.id} is not in the path and does not exist. Add it to the path or remove it.`);
      }
    }
  }
  const deps = new Map(nodes.map((n) => [n.id, n.prerequisites.filter((p) => ids.has(p))]));
  const done = new Set<string>();
  const order: string[] = [];
  // Greedy Kahn: always take the earliest node (in the caller's order) whose prerequisites are done,
  // so the caller's order is kept unless a dependency forces otherwise.
  while (order.length < nodes.length) {
    const ready = nodes.find((n) => !done.has(n.id) && deps.get(n.id)!.every((p) => done.has(p)));
    if (!ready) {
      const cycle = findCycle(deps);
      throw new MentorError('E_CYCLE', `Prerequisites form a cycle: ${cycle.join(' → ')}.`, { cycle });
    }
    done.add(ready.id);
    order.push(ready.id);
  }
  return order;
}

function findCycle(deps: Map<string, string[]>): string[] {
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    state.set(id, 'visiting');
    stack.push(id);
    for (const p of deps.get(id) ?? []) {
      if (state.get(p) === 'visiting') return [...stack.slice(stack.indexOf(p)), p];
      if (!state.has(p)) {
        const c = visit(p);
        if (c) return c;
      }
    }
    stack.pop();
    state.set(id, 'done');
    return null;
  };
  for (const id of deps.keys()) {
    if (!state.has(id)) {
      const c = visit(id);
      if (c) return c;
    }
  }
  return [];
}

export interface UnmetCriterion {
  kind: Criterion['kind'];
  independent: boolean;
  need: number;
  have: number;
}

/** Which criteria of a stage are not yet met by successful evidence recorded since the stage started. */
export function unmetCriteria(stage: Stage, evidence: EvidenceRecord[]): UnmetCriterion[] {
  const since = stage.started;
  const relevant = evidence.filter((e) => !since || e.day >= since);
  const unmet: UnmetCriterion[] = [];
  for (const c of stage.criteria) {
    const have = relevant.filter((e) => {
      const n = normalize(e);
      if (!n || !n.success) return false;
      // Transfer also satisfies application criteria.
      const kindOk = n.kind === c.kind || (c.kind === 'application' && n.kind === 'transfer');
      return kindOk && (!c.independent || n.independent);
    }).length;
    if (have < c.min) unmet.push({ kind: c.kind, independent: c.independent, need: c.min, have });
  }
  return unmet;
}

const ALLOWED: Record<Stage['status'], Stage['status'][]> = {
  pending: ['active', 'skipped'],
  active: ['done', 'skipped', 'pending'],
  done: [],
  skipped: [],
};

export function assertTransition(stage: Stage, to: Stage['status']): void {
  if (stage.status === to) return;
  if (!ALLOWED[stage.status].includes(to)) {
    throw new MentorError('E_CONFLICT', `Stage "${stage.id}" is ${stage.status}; it cannot become ${to}. Completed and skipped stages are final.`);
  }
}
