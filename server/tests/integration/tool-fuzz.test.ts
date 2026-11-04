/** Random and hostile inputs to every MCP tool must never produce an internal error (Phase 5). */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { makeHarness, seedCpp, type Harness } from './helpers.js';

let h: Harness;
beforeAll(async () => {
  h = await makeHarness();
  await seedCpp(h);
});
afterAll(async () => {
  await h.close();
});

const SEED = Number(process.env.FUZZ_SEED ?? 4242);
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NASTY: unknown[] = [
  '', ' ', 'cpp/pointers', '../../etc/passwd', 'cpp/../x', 'CON', 'cpp/con', '__proto__', 'constructor', 'a'.repeat(5000),
  '<!-- mentor:end -->', 'sk-ant-' + 'A'.repeat(30), '\u0000', '😀', -1, 0, 1, 3.5, 1e309, true, false, null, [], {}, ['cpp/pointers'],
  { kind: 'recall', outcome: 'success' }, { __proto__: { polluted: 1 } }, 'file:///etc/passwd', 'https://example.com', 'http://x',
];

describe('tool input fuzzing', () => {
  it('every tool answers every random input with a result or a clean, coded error', async () => {
    const { tools } = await h.client.listTools();
    const r = rng(SEED);
    const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
    let calls = 0;
    for (const tool of tools) {
      // Skip deletes with tokens: random strings never match a real token anyway, and we don't
      // want to purge the fixture mid-test.
      const props = Object.keys((tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {});
      for (let i = 0; i < 25; i++) {
        const args: Record<string, unknown> = {};
        for (const p of props) if (r() < 0.7) args[p] = pick(NASTY);
        if (tool.name === 'mentor_delete') args.confirmation_token = 'NOTATOKEN';
        if (tool.name === 'mentor_export') continue; // writes real folders next to the root
        const res = await h.call(tool.name, args);
        calls++;
        expect(res.text, `${tool.name} ${JSON.stringify(args).slice(0, 200)}`).not.toMatch(/Internal error/);
        if (res.isError) expect(res.text).toMatch(/^(E_[A-Z_]+:|MCP error|Input validation error|.*validation)/i);
      }
    }
    expect(calls).toBeGreaterThan(400);
    // The data is still healthy afterwards.
    expect((await h.call('mentor_doctor')).json.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  }, 120_000);
});
