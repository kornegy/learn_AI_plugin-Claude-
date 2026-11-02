import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Mentor } from '../../src/services/mentor.js';
import { fixedClock } from '../../src/core/clock.js';
import { checkpointNudge } from '../../src/services/nudge.js';

const NUDGE = path.resolve(__dirname, '../../dist/nudge.mjs');
let base: string;
let root: string;
let workspace: string;
let pluginData: string;
let mentor: Mentor;

beforeAll(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-nudge-'));
  root = path.join(base, 'LM');
  workspace = path.join(base, 'learning');
  pluginData = path.join(base, 'plugin-data');
  await fs.mkdir(workspace, { recursive: true });
  mentor = new Mentor(root, fixedClock('2026-10-01T10:00:00Z'));
  await mentor.init({ workspace_path: workspace });
  await mentor.upsertTopic({ topic_id: 'cpp/pointers', title: 'Pointers' });
});
afterAll(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

const env = () => ({ LEARNING_MENTOR_HOME: root, CLAUDE_PLUGIN_DATA: pluginData });

describe('checkpoint nudge', () => {
  it('stays silent until N prompts pass without any recorded change, then repeats every N', async () => {
    const outs: string[] = [];
    for (let i = 0; i < 17; i++) outs.push(await checkpointNudge({ session_id: 's1', cwd: workspace }, env(), 8));
    expect(outs.slice(0, 8).every((o) => o === '')).toBe(true);
    expect(outs[8]).toMatch(/no learning progress has been recorded in the last 8 messages/);
    expect(outs.slice(9, 16).every((o) => o === '')).toBe(true);
    expect(outs[16]).toMatch(/last 16 messages/);
  });

  it('resets when progress is recorded', async () => {
    for (let i = 0; i < 7; i++) await checkpointNudge({ session_id: 's2', cwd: workspace }, env(), 8);
    await mentor.recordEvidence({ topic_id: 'cpp/pointers', events: [{ kind: 'recall', outcome: 'success' }] });
    const outs: string[] = [];
    for (let i = 0; i < 8; i++) outs.push(await checkpointNudge({ session_id: 's2', cwd: workspace }, env(), 8));
    expect(outs.every((o) => o === '')).toBe(true);
  });

  it('is silent outside workspaces, without a session id, and without data', async () => {
    for (let i = 0; i < 20; i++) expect(await checkpointNudge({ session_id: 's3', cwd: os.tmpdir() }, env(), 2)).toBe('');
    expect(await checkpointNudge({ cwd: workspace }, env(), 1)).toBe('');
    expect(await checkpointNudge({ session_id: 's4', cwd: workspace }, { LEARNING_MENTOR_HOME: path.join(base, 'none') }, 1)).toBe('');
  });

  it('the bundled hook outputs UserPromptSubmit JSON and exits 0 quickly', () => {
    let last = { status: -1 as number | null, stdout: '' };
    const started = Date.now();
    for (let i = 0; i < 3; i++) {
      last = spawnSync(process.execPath, [NUDGE], {
        input: JSON.stringify({ session_id: 'bundle', cwd: workspace, prompt: 'hi', hook_event_name: 'UserPromptSubmit' }),
        env: { ...process.env, ...env(), LM_NUDGE_THRESHOLD: '' },
        encoding: 'utf8',
      });
      expect(last.status).toBe(0);
    }
    expect((Date.now() - started) / 3).toBeLessThan(process.env.CI ? 2000 : 800);
    expect(spawnSync(process.execPath, [NUDGE], { input: '{bad', encoding: 'utf8' }).status).toBe(0);
  });
});
