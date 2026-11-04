/** Data written by released versions must keep working (DATA_FORMAT §11, Phase 5). */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Mentor } from '../../src/services/mentor.js';
import { fixedClock } from '../../src/core/clock.js';
import { copyDir } from '../../src/storage/fsx.js';

const FIXTURES = path.resolve(__dirname, '../fixtures');
let root: string;
afterEach(async () => {
  await fs.rm(path.dirname(root), { recursive: true, force: true });
});

describe.each(['data-v0.1.0'])('compatibility with %s', (fixture) => {
  beforeEach(async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-compat-'));
    root = path.join(base, 'LM');
    await copyDir(path.join(FIXTURES, fixture), root, (rel) => rel === 'FIXTURE.md');
  });

  it('passes doctor without repairs: derived fields match what this version computes', async () => {
    const m = new Mentor(root, fixedClock('2026-11-02T10:00:00Z'));
    const report = await m.data.doctor({});
    expect(report.problems).toEqual([]);
  });

  it('supports the full read and write surface', async () => {
    const m = new Mentor(root, fixedClock('2026-11-02T10:00:00Z'));
    const ctx = await m.getContext({});
    expect(ctx.card).toContain('cpp/pointers');
    expect(((await m.insights({})).insights as unknown[]).length).toBeGreaterThanOrEqual(0);
    expect((await m.progress({ subject: 'cpp' })).map).toContain('pointers');
    const r = await m.recordEvidence({ topic_id: 'cpp/pointers', events: [{ kind: 'explanation', outcome: 'success', addresses: ['addr-vs-value'] }] });
    expect(r.level_after).toBeGreaterThanOrEqual(3);
    await m.updateStage({ topic_id: 'cpp/pointers', stage_id: 'dereferencing', status: 'done', override_reason: 'compat test' });
    await m.logSession({ summary: 'compat check' });
    expect((await m.data.doctor({})).problems).toEqual([]);
  });

  it('keeps unknown fields written by other versions', async () => {
    const p = path.join(root, 'knowledge-base/cpp/variables.md');
    await fs.writeFile(p, (await fs.readFile(p, 'utf8')).replace('schema: 1\n', 'schema: 1\nfuture_field: keep me\n'));
    const m = new Mentor(root, fixedClock('2026-11-02T10:00:00Z'));
    await m.recordEvidence({ topic_id: 'cpp/variables', events: [{ kind: 'recall', outcome: 'success', context: 'review' }] });
    expect(await fs.readFile(p, 'utf8')).toContain('future_field: keep me');
  });
});
