import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync, execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Mentor } from '../../src/services/mentor.js';
import { fixedClock } from '../../src/core/clock.js';
import { sessionStart } from '../../src/hook/main.js';

const HOOK = path.resolve(__dirname, '../../dist/hook.mjs');

let base: string;
let root: string;
let workspace: string;

beforeAll(async () => {
  // Make sure the bundle under test is built from the current sources.
  execSync('node esbuild.config.mjs', { cwd: path.resolve(__dirname, '../..'), stdio: 'ignore' });
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-hook-'));
  root = path.join(base, 'LearningMentor');
  workspace = path.join(base, 'learning');
  await fs.mkdir(path.join(workspace, 'cpp', 'ex1'), { recursive: true });
  const m = new Mentor(root, fixedClock('2026-10-01T10:00:00Z'));
  await m.init({ workspace_path: workspace, language: 'en' });
  // 200 topics to check timing on a realistic profile.
  const topics = Array.from({ length: 200 }, (_, i) => ({ topic_id: `cpp/topic-${i}`, title: `Topic ${i}` }));
  await m.planPath({ subject: 'cpp', goal: 'Systems programming', topics, create_missing: true });
  await m.recordEvidence({ topic_id: 'cpp/topic-1', events: [{ kind: 'explanation', outcome: 'success', note: 'explained stack vs heap' }] });
});

afterAll(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

function runHook(stdin: string, env: Record<string, string> = {}) {
  const started = Date.now();
  const res = spawnSync(process.execPath, [HOOK, 'session-start'], {
    input: stdin,
    env: { ...process.env, LEARNING_MENTOR_HOME: root, ...env },
    encoding: 'utf8',
    timeout: 10_000,
  });
  return { ...res, ms: Date.now() - started };
}

describe('session-start hook (bundled)', () => {
  it('injects the learner card as additionalContext inside a workspace subfolder', () => {
    const res = runHook(JSON.stringify({ cwd: path.join(workspace, 'cpp', 'ex1'), source: 'startup', hook_event_name: 'SessionStart' }));
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
    expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart');
    const card = out.hookSpecificOutput.additionalContext;
    expect(card).toContain('Learning workspace: active');
    expect(card).toContain('cpp/topic-1 3 Partial understanding');
    expect(card).toContain('"cpp/topic-1: explained stack vs heap"');
    expect(card.length).toBeLessThanOrEqual(4000);
  });

  it('prints nothing outside a workspace (no behaviour change in normal projects)', () => {
    const res = runHook(JSON.stringify({ cwd: os.tmpdir(), source: 'startup' }));
    expect(res.status).toBe(0);
    expect(res.stdout).toBe('');
  });

  it('prints nothing when the data folder does not exist yet', () => {
    const res = runHook(JSON.stringify({ cwd: workspace }), { LEARNING_MENTOR_HOME: path.join(base, 'nothing-here') });
    expect(res.status).toBe(0);
    expect(res.stdout).toBe('');
  });

  it('survives empty or invalid stdin', () => {
    expect(runHook('').status).toBe(0);
    expect(runHook('{not json').status).toBe(0);
  });

  it('turns broken configuration into one fact line, never a failure', async () => {
    const cfg = path.join(root, '.mentor', 'config.yaml');
    const original = await fs.readFile(cfg, 'utf8');
    await fs.writeFile(cfg, 'workspaces: [unclosed\n');
    try {
      const res = runHook(JSON.stringify({ cwd: workspace }));
      expect(res.status).toBe(0);
      const out = JSON.parse(res.stdout) as { hookSpecificOutput: { additionalContext: string } };
      expect(out.hookSpecificOutput.additionalContext).toMatch(/could not be read \(E_CORRUPT\)/);
    } finally {
      await fs.writeFile(cfg, original);
    }
  });

  it('rejects a relative LEARNING_MENTOR_HOME with a fact line', async () => {
    const out = await sessionStart({ cwd: workspace }, { LEARNING_MENTOR_HOME: 'relative' });
    expect(out.stdout).toMatch(/must be an absolute path/);
  });

  it('runs fast on a 200-topic profile', () => {
    runHook(JSON.stringify({ cwd: workspace })); // warm the file cache
    const res = runHook(JSON.stringify({ cwd: workspace }));
    expect(res.status).toBe(0);
    // Target is 300 ms on a developer machine; CI runners are slower, so allow headroom.
    expect(res.ms).toBeLessThan(process.env.CI ? 3000 : 1500);
  });
});
