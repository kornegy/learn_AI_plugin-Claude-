/** Enforces the layering and privacy rules of ARCHITECTURE §3.2 and ADR-008. */
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../../src');

async function files(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await files(p)));
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const imports = (src: string) => [...src.matchAll(/^\s*import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]!);

describe('architecture rules', () => {
  it('engine/ is pure: no filesystem, process or network imports', async () => {
    for (const f of await files(path.join(SRC, 'engine'))) {
      const src = await fs.readFile(f, 'utf8');
      const bad = imports(src).filter((i) => /^(node:)?(fs|fs\/promises|child_process|net|http|https|os|path)$/.test(i) || i.includes('/storage/') || i.includes('/services/'));
      expect(bad, path.relative(SRC, f)).toEqual([]);
    }
  });

  it('the server contains no network code (no telemetry, no fetching)', async () => {
    for (const f of await files(SRC)) {
      const src = await fs.readFile(f, 'utf8');
      const bad = imports(src).filter((i) => /^(node:)?(net|http|https|http2|dgram|tls)$/.test(i) || i === 'undici');
      expect(bad, path.relative(SRC, f)).toEqual([]);
      expect(/\bfetch\s*\(/.test(src), `${path.relative(SRC, f)} calls fetch`).toBe(false);
      expect(/XMLHttpRequest|WebSocket\(/.test(src), path.relative(SRC, f)).toBe(false);
    }
  });

  it('no runtime dynamic import(): it makes esbuild wrap zod lazily and breaks the bundle', async () => {
    for (const f of await files(SRC)) {
      const src = await fs.readFile(f, 'utf8');
      expect(/(await|=|return)\s+import\s*\(/.test(src), `${path.relative(SRC, f)} uses a dynamic import`).toBe(false);
    }
  });

  it('mcp/ and hook/ use services, not storage directly (except root resolution)', async () => {
    for (const dir of ['mcp', 'hook']) {
      for (const f of await files(path.join(SRC, dir))) {
        const bad = imports(await fs.readFile(f, 'utf8')).filter((i) => i.includes('/storage/') && !i.endsWith('/storage/root.js'));
        expect(bad, path.relative(SRC, f)).toEqual([]);
      }
    }
  });
});
