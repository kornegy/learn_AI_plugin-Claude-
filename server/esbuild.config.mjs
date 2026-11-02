// Bundles the MCP server and the hook runner into single-file ESM programs.
// The output in dist/ is committed: plugins are installed without a build step.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  legalComments: 'none',
  minify: true,
  logLevel: 'info',
  define: { __MENTOR_VERSION__: JSON.stringify(pkg.version) },
  // Some dependencies use require(); give the ESM bundle a working require.
  banner: {
    js: "import { createRequire as __lmCreateRequire } from 'node:module'; const require = __lmCreateRequire(import.meta.url);",
  },
};

await build({ ...common, entryPoints: ['src/mcp/main.ts'], outfile: 'dist/mentor-mcp.mjs' });
await build({ ...common, entryPoints: ['src/hook/main.ts'], outfile: 'dist/hook.mjs' });
await build({ ...common, entryPoints: ['src/hook/nudge.ts'], outfile: 'dist/nudge.mjs' });
