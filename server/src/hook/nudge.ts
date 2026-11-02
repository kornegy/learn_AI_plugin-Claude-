/**
 * UserPromptSubmit hook (bundled to dist/nudge.mjs). Runs on every prompt in every session, so it
 * is a separate, minimal bundle. Never blocks: any failure means no output and exit code 0.
 */
import { checkpointNudge } from '../services/nudge.js';

async function readStdin(timeoutMs = 1000): Promise<string> {
  if (process.stdin.isTTY) return '';
  return new Promise((resolve) => {
    let data = '';
    const timer = setTimeout(() => resolve(data), timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
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
  let input: { session_id?: string; cwd?: string } = {};
  try {
    const raw = await readStdin();
    if (raw.trim()) input = JSON.parse(raw) as typeof input;
  } catch {
    input = {};
  }
  const line = await checkpointNudge(input, process.env);
  if (line) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: line } }));
  process.exit(0);
}

const entry = process.argv[1] ?? '';
if (/nudge\.mjs$|hook[\\/]nudge\.(ts|js)$/.test(entry)) {
  main().catch(() => process.exit(0));
}
