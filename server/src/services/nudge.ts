/**
 * Checkpoint nudge (Phase 4): on each prompt in a learning workspace, count prompts since the
 * learner's data last changed. Every `threshold` prompts without a change, return one FACT line,
 * so the mentor notices unrecorded progress. Deliberately light: no zod, no services, no model call.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { latestJournalEventId } from '../storage/journal-tail.js';
import { isInside, realOrResolved, resolveRoot, rel } from '../storage/root.js';

export const NUDGE_THRESHOLD = 8;

interface NudgeState {
  last_seen: string | null;
  since: number;
}

function stateDir(env: NodeJS.ProcessEnv): string {
  const data = env.CLAUDE_PLUGIN_DATA;
  return data && path.isAbsolute(data) ? path.join(data, 'nudge') : path.join(os.tmpdir(), 'learning-mentor-nudge');
}

async function inWorkspace(root: string, cwd: string): Promise<boolean> {
  let text: string;
  try {
    text = await fs.readFile(path.join(root, rel.config()), 'utf8');
  } catch {
    return false;
  }
  let workspaces: unknown;
  try {
    workspaces = (YAML.parse(text, { schema: 'core' }) as { workspaces?: unknown } | null)?.workspaces;
  } catch {
    return false;
  }
  if (!Array.isArray(workspaces)) return false;
  const real = await realOrResolved(cwd);
  return workspaces.some((w) => typeof w === 'string' && isInside(w, real));
}

export async function checkpointNudge(
  input: { session_id?: string; cwd?: string },
  env: NodeJS.ProcessEnv,
  threshold = NUDGE_THRESHOLD,
): Promise<string> {
  let root: string;
  try {
    root = resolveRoot(env);
  } catch {
    return '';
  }
  const session = (input.session_id ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  if (!session) return '';
  if (!(await inWorkspace(root, input.cwd || process.cwd()))) return '';

  const latest = await latestJournalEventId(root);
  const dir = stateDir(env);
  const file = path.join(dir, `${session}.json`);
  let state: NudgeState = { last_seen: null, since: 0 };
  try {
    state = JSON.parse(await fs.readFile(file, 'utf8')) as NudgeState;
  } catch {
    /* first prompt of this session */
  }
  state = latest !== state.last_seen ? { last_seen: latest, since: 0 } : { ...state, since: state.since + 1 };
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, JSON.stringify(state));
  } catch {
    return '';
  }
  if (state.since >= threshold && state.since % threshold === 0) {
    return `Learning Mentor: no learning progress has been recorded in the last ${state.since} messages of this learning session.`;
  }
  return '';
}
