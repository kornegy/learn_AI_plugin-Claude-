import { createRequire as __lmCreateRequire } from 'node:module'; const require = __lmCreateRequire(import.meta.url);
import {
  Mentor,
  systemClock
} from "./chunks/chunk-7ON5DH3E.mjs";
import {
  MentorError,
  resolveRoot
} from "./chunks/chunk-ZZRGJJCL.mjs";

// src/hook/main.ts
function contextJson(text, event = "SessionStart") {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } });
}
async function sessionStart(input, env, clock = systemClock) {
  let root;
  try {
    root = resolveRoot(env);
  } catch (e) {
    return { stdout: contextJson(`Learning Mentor: data folder setting is invalid (${e instanceof Error ? e.message : String(e)}).`) };
  }
  const mentor = new Mentor(root, clock);
  try {
    if (!await mentor.store.isInitialized()) return { stdout: "" };
    const config = await mentor.config();
    const cwd = input.cwd || process.cwd();
    const workspace = await mentor.workspaceFor(cwd, config);
    if (!workspace) return { stdout: "" };
    const { card } = await mentor.getContext({ cwd });
    return { stdout: contextJson(card) };
  } catch (e) {
    const code = e instanceof MentorError ? e.code : "internal error";
    return {
      stdout: contextJson(`Learning Mentor: learning data could not be read (${code}). The learner can run /learning-mentor:status; mentor_doctor can repair data.`)
    };
  }
}
async function readStdin(timeoutMs = 1e3) {
  if (process.stdin.isTTY) return "";
  return new Promise((resolve) => {
    let data = "";
    const timer = setTimeout(() => resolve(data), timeoutMs);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => data += chunk);
    process.stdin.on("end", () => {
      clearTimeout(timer);
      resolve(data);
    });
    process.stdin.on("error", () => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}
async function main() {
  const command = process.argv[2];
  let input = {};
  try {
    const raw = await readStdin();
    if (raw.trim()) input = JSON.parse(raw);
  } catch {
    input = {};
  }
  let out = { stdout: "" };
  if (command === "session-start") out = await sessionStart(input, process.env);
  if (out.stdout) process.stdout.write(out.stdout);
  process.exit(0);
}
var entry = process.argv[1] ?? "";
if (/hook\.mjs$|hook[\\/]main\.(ts|js)$/.test(entry)) {
  main().catch(() => process.exit(0));
}
export {
  sessionStart
};
