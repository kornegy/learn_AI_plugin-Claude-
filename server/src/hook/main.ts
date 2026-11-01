/**
 * Hook runner (bundled to dist/hook.mjs). `session-start` prints the learner card as
 * additionalContext when the session's cwd is inside a registered learning workspace.
 * It never blocks a session: every failure becomes one fact line and exit code 0.
 */
import { systemClock, type Clock } from '../core/clock.js';
import { MentorError } from '../core/errors.js';
import { resolveRoot } from '../storage/root.js';
import { Mentor } from '../services/mentor.js';

export interface HookInput {
  cwd?: string;
  source?: string;
  hook_event_name?: string;
}

export interface HookOutput {
  stdout: string;
}

function contextJson(text: string, event = 'SessionStart'): string {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } });
}

export async function sessionStart(input: HookInput, env: NodeJS.ProcessEnv, clock: Clock = systemClock): Promise<HookOutput> {
  let root: string;
  try {
    root = resolveRoot(env);
  } catch (e) {
    return { stdout: contextJson(`Learning Mentor: data folder setting is invalid (${e instanceof Error ? e.message : String(e)}).`) };
  }
  const mentor = new Mentor(root, clock);
  try {
    if (!(await mentor.store.isInitialized())) return { stdout: '' };
    const config = await mentor.config();
    const cwd = input.cwd || process.cwd();
    const workspace = await mentor.workspaceFor(cwd, config);
    if (!workspace) return { stdout: '' };
    const { card } = await mentor.getContext({ cwd });
    return { stdout: contextJson(card) };
  } catch (e) {
    const code = e instanceof MentorError ? e.code : 'internal error';
    return {
      stdout: contextJson(`Learning Mentor: learning data could not be read (${code}). The learner can run /learning-mentor:status; mentor_doctor can repair data.`),
    };
  }
}

async function readStdin(timeoutMs = 1000): Promise<string> {
  if (process.stdin.isTTY) return '';
  return new Promise((resolve) => {
    let data = '';
    const timer = setTimeout(() => resolve(data), timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolve(data);
    });
    process.stdin.on('error', () => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function main(): Promise<void> {
  const command = process.argv[2];
  let input: HookInput = {};
  try {
    const raw = await readStdin();
    if (raw.trim()) input = JSON.parse(raw) as HookInput;
  } catch {
    input = {};
  }
  let out: HookOutput = { stdout: '' };
  if (command === 'session-start') out = await sessionStart(input, process.env);
  if (out.stdout) process.stdout.write(out.stdout);
  process.exit(0);
}

const entry = process.argv[1] ?? '';
if (/hook\.mjs$|hook[\\/]main\.(ts|js)$/.test(entry)) {
  main().catch(() => process.exit(0));
}
