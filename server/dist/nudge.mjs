import { createRequire as __lmCreateRequire } from 'node:module'; const require = __lmCreateRequire(import.meta.url);
import {
  DIRS,
  __toESM,
  isInside,
  realOrResolved,
  rel,
  require_dist,
  resolveRoot
} from "./chunks/chunk-ZZRGJJCL.mjs";

// src/services/nudge.ts
var import_yaml = __toESM(require_dist(), 1);
import { promises as fs2 } from "node:fs";
import os from "node:os";
import path2 from "node:path";

// src/storage/journal-tail.ts
import { promises as fs } from "node:fs";
import path from "node:path";
async function latestJournalEventId(root) {
  const dir = path.join(root, DIRS.journal);
  let files;
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".jsonl")).sort();
  } catch {
    return null;
  }
  for (const file of files.reverse()) {
    const handle = await fs.open(path.join(dir, file), "r");
    try {
      const { size } = await handle.stat();
      const len = Math.min(size, 32 * 1024);
      const buf = Buffer.alloc(len);
      await handle.read(buf, 0, len, size - len);
      const lines = buf.toString("utf8").split("\n").filter((l) => l.trim());
      for (const line of lines.reverse()) {
        try {
          const id = JSON.parse(line).id;
          if (typeof id === "string") return id;
        } catch {
        }
      }
    } finally {
      await handle.close();
    }
  }
  return null;
}

// src/services/nudge.ts
var NUDGE_THRESHOLD = 8;
function stateDir(env) {
  const data = env.CLAUDE_PLUGIN_DATA;
  return data && path2.isAbsolute(data) ? path2.join(data, "nudge") : path2.join(os.tmpdir(), "learning-mentor-nudge");
}
async function inWorkspace(root, cwd) {
  let text;
  try {
    text = await fs2.readFile(path2.join(root, rel.config()), "utf8");
  } catch {
    return false;
  }
  let workspaces;
  try {
    workspaces = import_yaml.default.parse(text, { schema: "core", logLevel: "error" })?.workspaces;
  } catch {
    return false;
  }
  if (!Array.isArray(workspaces)) return false;
  const real = await realOrResolved(cwd);
  return workspaces.some((w) => typeof w === "string" && isInside(w, real));
}
async function checkpointNudge(input, env, threshold = NUDGE_THRESHOLD) {
  let root;
  try {
    root = resolveRoot(env);
  } catch {
    return "";
  }
  const session = (input.session_id ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  if (!session) return "";
  if (!await inWorkspace(root, input.cwd || process.cwd())) return "";
  const latest = await latestJournalEventId(root);
  const dir = stateDir(env);
  const file = path2.join(dir, `${session}.json`);
  let state = { last_seen: null, since: 0 };
  try {
    state = JSON.parse(await fs2.readFile(file, "utf8"));
  } catch {
  }
  state = latest !== state.last_seen ? { last_seen: latest, since: 0 } : { ...state, since: state.since + 1 };
  try {
    await fs2.mkdir(dir, { recursive: true });
    await fs2.writeFile(file, JSON.stringify(state));
  } catch {
    return "";
  }
  if (state.since >= threshold && state.since % threshold === 0) {
    return `Learning Mentor: no learning progress has been recorded in the last ${state.since} messages of this learning session.`;
  }
  return "";
}

// src/hook/nudge.ts
async function readStdin(timeoutMs = 1e3) {
  if (process.stdin.isTTY) return "";
  return new Promise((resolve) => {
    let data = "";
    const timer = setTimeout(() => resolve(data), timeoutMs);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => data += c);
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
  let input = {};
  try {
    const raw = await readStdin();
    if (raw.trim()) input = JSON.parse(raw);
  } catch {
    input = {};
  }
  const line = await checkpointNudge(input, process.env);
  if (line) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: line } }));
  process.exit(0);
}
var entry = process.argv[1] ?? "";
if (/nudge\.mjs$|hook[\\/]nudge\.(ts|js)$/.test(entry)) {
  main().catch(() => process.exit(0));
}
