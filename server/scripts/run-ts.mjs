// Runs a TypeScript script from this package by bundling it to a temp file with esbuild.
// Usage: node scripts/run-ts.mjs <script.ts> [args...]
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [script, ...args] = process.argv.slice(2);
if (!script) {
  console.error('usage: node scripts/run-ts.mjs <script.ts> [args...]');
  process.exit(2);
}
const dir = mkdtempSync(path.join(tmpdir(), 'lm-run-'));
const out = path.join(dir, 'script.mjs');
await build({
  entryPoints: [script],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: out,
  logLevel: 'error',
  define: { __MENTOR_VERSION__: '"dev"' },
  banner: { js: "import { createRequire as __c } from 'node:module'; const require = __c(import.meta.url);" },
});
process.argv = [process.argv[0], out, ...args];
try {
  await import(pathToFileURL(out).href);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
