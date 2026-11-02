/** Smoke test of the real bundled stdio server, as Claude Code starts it. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER = path.resolve(__dirname, '../../dist/mentor-mcp.mjs');
let base: string;

beforeAll(async () => {
  execSync('node esbuild.config.mjs', { cwd: path.resolve(__dirname, '../..'), stdio: 'ignore' });
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-bundle-'));
});
afterAll(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

describe('dist/mentor-mcp.mjs over stdio', () => {
  it('starts, lists tools, initialises and records evidence', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [SERVER],
      env: { ...process.env, LEARNING_MENTOR_HOME: path.join(base, 'LM') } as Record<string, string>,
      cwd: base,
    });
    const client = new Client({ name: 'bundle-test', version: '1.0.0' });
    await client.connect(transport);
    try {
      expect(client.getInstructions()).toMatch(/evidence-based record/);
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(21);
      const call = async (name: string, args: Record<string, unknown>) =>
        (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
      expect((await call('mentor_init', { workspace_path: base })).isError).toBeFalsy();
      expect((await call('mentor_upsert_topic', { topic_id: 'sql/joins', title: 'JOIN' })).isError).toBeFalsy();
      const r = await call('mentor_record_evidence', { topic_id: 'sql/joins', events: [{ kind: 'explanation', outcome: 'success' }] });
      expect(r.content[0]!.text).toMatch(/Level changed: none → 3/);
      const ctx = await call('mentor_get_context', {});
      expect(ctx.content[0]!.text).toContain('Learning workspace: active');
    } finally {
      await client.close();
    }
  });
});
