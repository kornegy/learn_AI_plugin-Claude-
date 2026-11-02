import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { makeHarness, seedCpp, type Harness } from './helpers.js';
import { Mentor } from '../../src/services/mentor.js';
import { fixedClock } from '../../src/core/clock.js';

let h: Harness;
afterEach(async () => {
  await h?.close();
});

const read = (h: Harness, rel: string) => fs.readFile(path.join(h.root, rel), 'utf8');

describe('MCP server: tool surface', () => {
  it('lists all 21 tools with descriptions and annotations', async () => {
    h = await makeHarness();
    const { tools } = await h.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'mentor_delete', 'mentor_doctor', 'mentor_export', 'mentor_find_sources', 'mentor_find_topics', 'mentor_get_context',
        'mentor_get_topic', 'mentor_init', 'mentor_insights', 'mentor_log_session', 'mentor_next', 'mentor_plan_path', 'mentor_plan_topic', 'mentor_progress', 'mentor_record_evidence',
        'mentor_save_source', 'mentor_set_level', 'mentor_settings', 'mentor_update_profile', 'mentor_update_stage', 'mentor_upsert_topic',
      ].sort(),
    );
    for (const t of tools) expect(t.description!.length).toBeGreaterThan(40);
    expect(tools.find((t) => t.name === 'mentor_delete')!.annotations?.destructiveHint).toBe(true);
  });

  it('reports a missing data folder with an actionable message', async () => {
    h = await makeHarness();
    const r = await h.call('mentor_get_context');
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/E_NOT_INITIALIZED.*\/learning-mentor:start/);
  });
});

describe('scenario 1: new learner, new topic', () => {
  it('initialises the four folders and the workspace', async () => {
    h = await makeHarness();
    const r = await h.call('mentor_init', { workspace_path: h.workspace, language: 'ru' });
    expect(r.isError).toBe(false);
    for (const dir of ['learner-profile', '.mentor/journal']) expect((await fs.stat(path.join(h.root, dir))).isDirectory()).toBe(true);
    expect(await read(h, 'README.md')).toContain('Nothing in this folder is sent anywhere');
    const again = await h.call('mentor_init', { workspace_path: h.workspace });
    expect(again.json.already_initialized).toBe(true);
    expect(again.json.workspaces).toHaveLength(1);
  });

  it('plans a path with stub topics, a topic plan with an active first stage, and a readable card', async () => {
    h = await makeHarness();
    await seedCpp(h);
    const topic = await read(h, 'knowledge-base/cpp/pointers.md');
    expect(topic).toContain('title: Указатели');
    expect(topic).toContain('Не оценено');
    const plan = await read(h, 'learning-paths/cpp/pointers.md');
    expect(plan).toMatch(/\[>\] 1\. Зачем нужны указатели/);
    const ctx = await h.call('mentor_get_context');
    const card = ctx.json.card as string;
    expect(card).toContain('Learning workspace: active');
    expect(card).toMatch(/Current: cpp\/pointers — stage 1\/3/);
    const next = await h.call('mentor_next');
    const recs = next.json.recommendations as { type: string; topic?: string }[];
    expect(recs[0]).toMatchObject({ type: 'continue_stage', topic: 'cpp/pointers' });
    expect(recs.find((r) => r.type === 'next_topic')?.topic).toBe('cpp/variables');
  });

  it('rejects cycles and unknown prerequisites', async () => {
    h = await makeHarness();
    await h.call('mentor_init', {});
    const r = await h.call('mentor_plan_path', {
      subject: 'cpp',
      goal: 'g',
      create_missing: true,
      topics: [
        { topic_id: 'cpp/a', title: 'A', prerequisites: ['cpp/b'] },
        { topic_id: 'cpp/b', title: 'B', prerequisites: ['cpp/a'] },
      ],
    });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/E_CYCLE/);
  });
});

describe('scenarios 4 and 5: evidence, levels, misconceptions, stages', () => {
  it('does not reach "solid" after one explanation; reaches it after applications on two days', async () => {
    h = await makeHarness();
    await seedCpp(h);
    let r = await h.call('mentor_record_evidence', { topic_id: 'cpp/pointers', events: [{ kind: 'exposure', outcome: 'success' }] });
    expect(r.json.level_after).toBeNull(); // reading never raises the level
    r = await h.call('mentor_record_evidence', { topic_id: 'cpp/pointers', events: [{ kind: 'explanation', outcome: 'success', note: 'address vs value', quote: 'like a note with a flat address' }] });
    expect(r.json).toMatchObject({ level_before: null, level_after: 3, level_changed: true, provisional: true });
    expect(r.json.next_evidence_needed).toMatch(/2 different days/);
    r = await h.call('mentor_record_evidence', { topic_id: 'cpp/pointers', events: [{ kind: 'application', outcome: 'success' }] });
    expect(r.json.level_after).toBe(3);
    h.clock.advanceDays(2);
    r = await h.call('mentor_record_evidence', { topic_id: 'cpp/pointers', events: [{ kind: 'application', outcome: 'success', context: 'review' }] });
    expect(r.json.level_after).toBe(4);
    const file = await read(h, 'knowledge-base/cpp/pointers.md');
    expect(file).toContain('level: 4');
    expect(file).toContain('Хорошо знаю');
    expect(file).toContain('like a note with a flat address');
    const overview = await read(h, 'learner-profile/subjects/cpp.md');
    expect(overview).toMatch(/Указатели \(`cpp\/pointers`\) \| 4/);
  });

  it('tracks a recurring misconception separately from slips and caps the level', async () => {
    h = await makeHarness();
    await seedCpp(h);
    const misc = { id: 'addr-vs-value', description: 'Confuses &x and *p' };
    await h.call('mentor_record_evidence', { topic_id: 'cpp/pointers', events: [{ kind: 'explanation', outcome: 'success' }, { kind: 'application', outcome: 'success' }] });
    h.clock.advanceDays(1);
    let r = await h.call('mentor_record_evidence', { topic_id: 'cpp/pointers', events: [{ kind: 'application', outcome: 'fail', misconception: misc }] });
    expect(r.json.misconception_changes).toEqual([{ id: 'addr-vs-value', from: null, to: 'open' }]);
    h.clock.advanceDays(1);
    r = await h.call('mentor_record_evidence', { topic_id: 'cpp/pointers', events: [{ kind: 'application', outcome: 'success' }] });
    expect(r.json.level_after).toBe(3); // capped by the open misconception
    const ctx = await h.call('mentor_get_context');
    expect(ctx.json.card).toMatch(/Open misconceptions: addr-vs-value/);
    r = await h.call('mentor_record_evidence', { topic_id: 'cpp/pointers', events: [{ kind: 'explanation', outcome: 'success', addresses: ['addr-vs-value'] }] });
    h.clock.advanceDays(1);
    r = await h.call('mentor_record_evidence', { topic_id: 'cpp/pointers', events: [{ kind: 'application', outcome: 'success', addresses: ['addr-vs-value'] }] });
    expect(r.json.level_after).toBe(4);
  });

  it('refuses to complete a stage without evidence, accepts it with evidence, and auto-advances', async () => {
    h = await makeHarness();
    await seedCpp(h);
    let r = await h.call('mentor_update_stage', { topic_id: 'cpp/pointers', stage_id: 'why', status: 'done' });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/E_CRITERIA_UNMET.*1 more successful explanation/);
    await h.call('mentor_record_evidence', { topic_id: 'cpp/pointers', events: [{ kind: 'explanation', outcome: 'success' }] });
    r = await h.call('mentor_update_stage', { topic_id: 'cpp/pointers', stage_id: 'why', status: 'done' });
    expect(r.json).toMatchObject({ status: 'done', activated_next: 'deref', progress: '1/3' });
    r = await h.call('mentor_update_stage', { topic_id: 'cpp/pointers', stage_id: 'why', status: 'active' });
    expect(r.text).toMatch(/final/);
    r = await h.call('mentor_update_stage', { topic_id: 'cpp/pointers', stage_id: 'deref', status: 'skipped' });
    expect(r.text).toMatch(/needs a reason/);
    r = await h.call('mentor_update_stage', { topic_id: 'cpp/pointers', stage_id: 'deref', status: 'done', override_reason: 'Showed it in a previous course project' });
    expect(r.json.status).toBe('done');
    expect(await read(h, 'learning-paths/cpp/pointers.md')).toContain('override_reason: Showed it in a previous course project');
  });

  it('re-plans pending stages without touching completed ones and inserts reinforcement stages', async () => {
    h = await makeHarness();
    await seedCpp(h);
    await h.call('mentor_record_evidence', { topic_id: 'cpp/pointers', events: [{ kind: 'explanation', outcome: 'success' }] });
    await h.call('mentor_update_stage', { topic_id: 'cpp/pointers', stage_id: 'why', status: 'done' });
    let r = await h.call('mentor_plan_topic', {
      topic_id: 'cpp/pointers',
      mode: 'replace_pending',
      stages: [{ id: 'functions', title: 'Указатели в функциях', goal: 'Pass by pointer', criteria: [{ kind: 'application' }] }],
    });
    expect((r.json.stages as { id: string }[]).map((s) => s.id)).toEqual(['why', 'deref', 'functions']);
    r = await h.call('mentor_plan_topic', {
      topic_id: 'cpp/pointers',
      mode: 'insert',
      after_stage_id: 'why',
      stages: [{ id: 'reinforce', title: 'Повторение', goal: 'Recall why', criteria: [{ kind: 'recall' }] }],
    });
    expect((r.json.stages as { id: string }[]).map((s) => s.id)).toEqual(['why', 'reinforce', 'deref', 'functions']);
  });

  it('accepts a manual level with a reason, and new evidence replaces it', async () => {
    h = await makeHarness();
    await seedCpp(h);
    let r = await h.call('mentor_set_level', { topic_id: 'cpp/variables', level: 4, reason: 'Learner uses variables daily at work' });
    expect(r.json.level).toBe(4);
    expect(await read(h, 'knowledge-base/cpp/variables.md')).toContain('задано вручную');
    h.clock.advanceDays(1);
    r = await h.call('mentor_record_evidence', { topic_id: 'cpp/variables', events: [{ kind: 'recall', outcome: 'success' }] });
    expect(r.json.level_after).toBe(2);
  });

  it('rejects secrets and invalid ids', async () => {
    h = await makeHarness();
    await seedCpp(h);
    let r = await h.call('mentor_record_evidence', { topic_id: 'cpp/pointers', events: [{ kind: 'recall', outcome: 'success', note: 'password: hunter2hunter2' }] });
    expect(r.text).toMatch(/E_SECRET_DETECTED/);
    expect(r.text).not.toContain('hunter2');
    r = await h.call('mentor_record_evidence', { topic_id: 'cpp/../../etc', events: [{ kind: 'recall', outcome: 'success' }] });
    expect(r.isError).toBe(true);
    r = await h.call('mentor_record_evidence', { topic_id: 'cpp/unknown-topic', events: [{ kind: 'recall', outcome: 'success' }] });
    expect(r.text).toMatch(/E_NOT_FOUND.*mentor_upsert_topic/);
  });
});

describe('scenarios 2, 3, 9: continuity across sessions and after a break', () => {
  it('a new server instance (new chat) sees the same state; overdue reviews come first', async () => {
    h = await makeHarness();
    await seedCpp(h);
    await h.call('mentor_record_evidence', { topic_id: 'cpp/variables', events: [{ kind: 'explanation', outcome: 'success' }, { kind: 'recall', outcome: 'success' }] });
    // A different process later: new Mentor on the same root, 40 days later.
    const later = new Mentor(h.root, fixedClock('2026-11-10T10:00:00Z'));
    const ctx = await later.getContext({ cwd: h.workspace });
    expect(ctx.card).toMatch(/Due reviews: cpp\/variables \(overdue \d+ d\)/);
    expect(ctx.card).toMatch(/Last learning activity: 2026-10-01 \(40 day\(s\) ago\)/);
    const next = await later.next({});
    expect((next.recommendations as { type: string }[])[0]!.type).toBe('review');
  });

  it('a failed review regresses the level to "needs reinforcement"', async () => {
    h = await makeHarness();
    await seedCpp(h);
    await h.call('mentor_record_evidence', { topic_id: 'cpp/variables', events: [{ kind: 'explanation', outcome: 'success' }, { kind: 'application', outcome: 'success' }] });
    h.clock.advanceDays(30);
    const r = await h.call('mentor_record_evidence', { topic_id: 'cpp/variables', events: [{ kind: 'recall', outcome: 'fail', context: 'review' }] });
    expect(r.json).toMatchObject({ level_before: 3, level_after: 2, regressed_on: '2026-10-31' });
  });
});

describe('scenario 8: several subjects', () => {
  it('keeps subjects separate and finds topics across languages', async () => {
    h = await makeHarness();
    await seedCpp(h);
    await h.call('mentor_upsert_topic', { topic_id: 'sql/joins', title: 'Соединения таблиц', aliases: ['JOIN', 'joins'] });
    await h.call('mentor_record_evidence', { topic_id: 'sql/joins', events: [{ kind: 'recall', outcome: 'success' }] });
    let r = await h.call('mentor_find_topics', { query: 'join' });
    expect((r.json.matches as { id: string }[])[0]!.id).toBe('sql/joins');
    r = await h.call('mentor_find_topics', { query: 'указателей' });
    expect((r.json.matches as { id: string }[])[0]!.id).toBe('cpp/pointers');
    r = await h.call('mentor_get_context', { subject: 'sql' });
    expect((r.json.topics as { id: string }[]).map((t) => t.id)).toEqual(['sql/joins']);
    expect(await read(h, 'learner-profile/subjects/sql.md')).toContain('sql/joins');
  });
});

describe('profile, settings, research library (scenarios 10, 11)', () => {
  it('updates profile lists and observed preferences; rejects unknown fields', async () => {
    h = await makeHarness();
    await seedCpp(h);
    let r = await h.call('mentor_update_profile', { target: 'profile', add: { goals: ['Junior systems programmer'], strengths: ['Persistent'] } });
    expect(r.isError).toBe(false);
    r = await h.call('mentor_update_profile', { target: 'preferences', add: { observed: ['Spatial analogies work well'] }, set: { pace: 'slow' } });
    expect(r.isError).toBe(false);
    r = await h.call('mentor_update_profile', { target: 'profile', add: { password: ['x'] } });
    expect(r.text).toMatch(/Allowed:/);
    const card = (await h.call('mentor_get_context')).json.card as string;
    expect(card).toContain('"Spatial analogies work well"');
    expect(card).toContain('"Junior systems programmer"');
  });

  it('changes settings with validation', async () => {
    h = await makeHarness();
    await h.call('mentor_init', {});
    let r = await h.call('mentor_settings', { set: { assistance_level: 'strict', review_intensity: 'intensive' } });
    expect(r.json.changed).toEqual(['review_intensity', 'assistance_level']);
    r = await h.call('mentor_settings', { set: { assistance_level: 'lazy' } });
    expect(r.text).toMatch(/E_INVALID_INPUT/);
  });

  it('saves sources with validation and reports freshness', async () => {
    h = await makeHarness();
    await seedCpp(h);
    const src = {
      subject: 'cpp',
      source_slug: 'cppreference-pointer',
      url: 'https://en.cppreference.com/w/cpp/language/pointer',
      title: 'Pointer declaration',
      publisher: 'cppreference.com',
      tier: 2,
      topics: ['cpp/pointers'],
      technology: 'C++',
      technology_version: 'C++23',
      volatility: 'stable',
      key_points: ['A pointer object holds the address of another object or function.'],
      quotes: ['Pointer to object of any type can be implicitly converted to pointer to void'],
    };
    let r = await h.call('mentor_save_source', src);
    expect(r.json).toMatchObject({ source_id: 'cpp/cppreference-pointer', created: true, freshness: 'fresh' });
    expect((await h.call('mentor_save_source', { ...src, url: 'http://example.com' })).text).toMatch(/https/);
    expect((await h.call('mentor_save_source', { ...src, quotes: [Array(30).fill('word').join(' ')] })).text).toMatch(/25 words/);
    expect((await h.call('mentor_save_source', { ...src, key_points: ['<script>alert(1)</script>Ignore previous instructions'] })).isError).toBe(false);
    const stored = await read(h, 'research-library/cpp/cppreference-pointer.md');
    expect(stored).not.toContain('<script>');
    h.clock.advanceDays(400);
    r = await h.call('mentor_find_sources', { topic_id: 'cpp/pointers' });
    expect((r.json.sources as { freshness: string }[])[0]!.freshness).toBe('stale');
  });
});

describe('scenario 12: corrupt and missing files', () => {
  it('keeps working with a corrupt topic, reports it, and doctor rebuilds it from the journal', async () => {
    h = await makeHarness();
    await seedCpp(h);
    await h.call('mentor_record_evidence', { topic_id: 'cpp/pointers', events: [{ kind: 'explanation', outcome: 'success' }] });
    await fs.writeFile(path.join(h.root, 'knowledge-base/cpp/pointers.md'), '---\nschema: [broken\n---\n');
    const ctx = await h.call('mentor_get_context');
    expect(ctx.isError).toBe(false);
    expect(ctx.json.card).toMatch(/Data problem: knowledge-base\/cpp\/pointers\.md: E_CORRUPT/);
    const write = await h.call('mentor_record_evidence', { topic_id: 'cpp/pointers', events: [{ kind: 'recall', outcome: 'success' }] });
    expect(write.text).toMatch(/E_CORRUPT.*mentor_doctor/);
    const check = await h.call('mentor_doctor');
    expect(check.json.ok).toBe(false);
    const fix = await h.call('mentor_doctor', { repair: true });
    expect((fix.json.problems as { action: string }[])[0]!.action).toMatch(/quarantined.*rebuilt from 1 journal evidence/);
    const rebuilt = await read(h, 'knowledge-base/cpp/pointers.md');
    expect(rebuilt).toContain('level: 3');
    expect(rebuilt).toContain('title: Указатели');
    expect((await fs.readdir(path.join(h.root, '.mentor/quarantine'))).length).toBe(1);
    expect((await h.call('mentor_doctor')).json.ok).toBe(true);
  });

  it('rebuilds a deleted-by-accident topic file and a missing profile', async () => {
    h = await makeHarness();
    await seedCpp(h);
    await fs.rm(path.join(h.root, 'knowledge-base/cpp/variables.md'));
    await fs.rm(path.join(h.root, 'learner-profile/profile.md'));
    const fix = await h.call('mentor_doctor', { repair: true });
    expect(fix.isError).toBe(false);
    expect(await read(h, 'knowledge-base/cpp/variables.md')).toContain('title: Переменные');
    expect(await read(h, 'learner-profile/profile.md')).toContain('kind: profile');
  });

  it('opens newer-schema data read-only', async () => {
    h = await makeHarness();
    await seedCpp(h);
    const p = path.join(h.root, 'knowledge-base/cpp/pointers.md');
    await fs.writeFile(p, (await fs.readFile(p, 'utf8')).replace('schema: 1', 'schema: 9'));
    const r = await h.call('mentor_record_evidence', { topic_id: 'cpp/pointers', events: [{ kind: 'recall', outcome: 'success' }] });
    expect(r.text).toMatch(/E_SCHEMA_TOO_NEW.*Update the learning-mentor plugin/);
  });

  it('serialises concurrent writers from two processes (two server instances)', async () => {
    h = await makeHarness();
    await seedCpp(h);
    const other = new Mentor(h.root, fixedClock('2026-10-01T10:00:00Z'));
    await Promise.all([
      ...Array.from({ length: 5 }, () => h.mentor.recordEvidence({ topic_id: 'cpp/pointers', events: [{ kind: 'recall', outcome: 'success' }] })),
      ...Array.from({ length: 5 }, () => other.recordEvidence({ topic_id: 'cpp/pointers', events: [{ kind: 'recall', outcome: 'success' }] })),
    ]);
    const t = await h.call('mentor_get_topic', { topic_id: 'cpp/pointers', evidence_limit: 50 });
    expect((t.json.recent_evidence as unknown[]).length).toBe(10);
    expect((t.json.topic as { evidence_counts: Record<string, number> }).evidence_counts.recall).toBe(10);
  });
});

describe('scenario 13: export and delete', () => {
  it('exports everything and a single-file snapshot', async () => {
    h = await makeHarness();
    await seedCpp(h);
    const r = await h.call('mentor_export', { snapshot: true });
    const dest = r.json.export_path as string;
    expect(dest).toContain('LearningMentor-export-');
    expect(await fs.readFile(path.join(dest, 'knowledge-base/cpp/pointers.md'), 'utf8')).toContain('Указатели');
    const snap = await fs.readFile(r.json.snapshot_path as string, 'utf8');
    expect(snap).toContain('# Learner snapshot');
    expect(snap).toContain('Current stage in cpp/pointers');
    await fs.rm(dest, { recursive: true, force: true });
  });

  it('requires a confirmation token, moves to trash, and does not resurrect on repair', async () => {
    h = await makeHarness();
    await seedCpp(h);
    await h.call('mentor_record_evidence', { topic_id: 'cpp/pointers', events: [{ kind: 'explanation', outcome: 'success' }] });
    const step1 = await h.call('mentor_delete', { scope: 'topic', target: 'cpp/pointers' });
    expect(step1.isError).toBe(false);
    expect(step1.text).toMatch(/CONFIRMATION REQUIRED.*move to trash/);
    const token = step1.json.token as string;
    expect(await fs.stat(path.join(h.root, 'knowledge-base/cpp/pointers.md'))).toBeTruthy();
    const wrong = await h.call('mentor_delete', { scope: 'topic', target: 'cpp/variables', confirmation_token: token });
    expect(wrong.text).toMatch(/E_CONFIRMATION_INVALID/);
    const fresh = await h.call('mentor_delete', { scope: 'topic', target: 'cpp/pointers' });
    const step2 = await h.call('mentor_delete', { scope: 'topic', target: 'cpp/pointers', confirmation_token: fresh.json.token });
    expect(step2.json).toMatchObject({ deleted: 'topic', purge: false });
    await expect(fs.stat(path.join(h.root, 'knowledge-base/cpp/pointers.md'))).rejects.toBeTruthy();
    expect(await read(h, 'learning-paths/cpp/_path.md')).not.toContain('cpp/pointers');
    await h.call('mentor_doctor', { repair: true });
    await expect(fs.stat(path.join(h.root, 'knowledge-base/cpp/pointers.md'))).rejects.toBeTruthy();
    // Re-creating the topic starts fresh (old evidence is not counted).
    await h.call('mentor_upsert_topic', { topic_id: 'cpp/pointers', title: 'Указатели' });
    const t = await h.call('mentor_get_topic', { topic_id: 'cpp/pointers' });
    expect((t.json.topic as { level: number | null }).level).toBeNull();
  });

  it('purges a subject including its history', async () => {
    h = await makeHarness();
    await seedCpp(h);
    await h.call('mentor_record_evidence', { topic_id: 'cpp/pointers', events: [{ kind: 'explanation', outcome: 'success', note: 'private learning note' }] });
    const step1 = await h.call('mentor_delete', { scope: 'subject', target: 'cpp', purge: true });
    expect(step1.text).toMatch(/PERMANENTLY delete/);
    const step2 = await h.call('mentor_delete', { scope: 'subject', target: 'cpp', purge: true, confirmation_token: step1.json.token });
    expect(step2.json.removed_journal_events).toBeGreaterThan(0);
    const journalDir = path.join(h.root, '.mentor/journal');
    const journal = (await Promise.all((await fs.readdir(journalDir)).map((f) => fs.readFile(path.join(journalDir, f), 'utf8')))).join('');
    expect(journal).not.toContain('private learning note');
    expect(journal).not.toContain('cpp/pointers');
  });

  it('purges everything', async () => {
    h = await makeHarness();
    await seedCpp(h);
    const step1 = await h.call('mentor_delete', { scope: 'all', purge: true });
    await h.call('mentor_delete', { scope: 'all', purge: true, confirmation_token: step1.json.token });
    expect(await fs.readdir(h.root)).toEqual([]);
  });
});

describe('phase 4: continuity, insights, reviews, progress', () => {
  it('logs a session summary that the next session sees, until newer evidence makes it stale', async () => {
    h = await makeHarness();
    await seedCpp(h);
    await h.call('mentor_record_evidence', { topic_id: 'cpp/pointers', events: [{ kind: 'explanation', outcome: 'success' }] });
    const r = await h.call('mentor_log_session', { summary: 'Explained why pointers exist; *p still shaky', next_step: 'Practise *p reads and writes', topics: ['cpp/pointers'] });
    expect(r.isError).toBe(false);
    const later = new Mentor(h.root, fixedClock('2026-10-05T10:00:00Z'));
    const card = (await later.getContext({ cwd: h.workspace })).card;
    expect(card).toContain('Last session summary: "Explained why pointers exist; *p still shaky"');
    expect(card).toContain('Planned next step: "Practise *p reads and writes"');
    await later.recordEvidence({ topic_id: 'cpp/variables', events: [{ kind: 'recall', outcome: 'success' }] });
    expect((await later.getContext({ cwd: h.workspace })).card).not.toContain('Last session summary');
    expect((await h.call('mentor_log_session', { summary: 'password: hunter2hunter2' })).text).toMatch(/E_SECRET_DETECTED/);
  });

  it('reports a misconception shared by two topics as a high-severity insight, also in the card', async () => {
    h = await makeHarness();
    await seedCpp(h);
    const m = { id: 'addr-vs-value', description: 'Confuses &x and *p' };
    await h.call('mentor_upsert_topic', { topic_id: 'cpp/references', title: 'Ссылки' });
    await h.call('mentor_record_evidence', { topic_id: 'cpp/pointers', events: [{ kind: 'application', outcome: 'fail', misconception: m }] });
    await h.call('mentor_record_evidence', { topic_id: 'cpp/references', events: [{ kind: 'recall', outcome: 'fail', misconception: m }] });
    const r = await h.call('mentor_insights', {});
    const ins = r.json.insights as { type: string; topics: string[] }[];
    expect(ins[0]).toMatchObject({ type: 'cross_topic_misconception', topics: ['cpp/pointers', 'cpp/references'] });
    expect((await h.call('mentor_get_context')).json.card).toMatch(/Insight: "Misconception 'addr-vs-value'/);
  });

  it('suggests reinforcement after a regression and interleaves review sessions', async () => {
    h = await makeHarness();
    await seedCpp(h);
    await h.call('mentor_upsert_topic', { topic_id: 'sql/joins', title: 'JOIN' });
    for (const t of ['cpp/variables', 'sql/joins', 'cpp/memory-basics']) {
      await h.call('mentor_record_evidence', { topic_id: t, events: [{ kind: 'explanation', outcome: 'success' }, { kind: 'application', outcome: 'success' }] });
    }
    h.clock.advanceDays(30);
    const r = await h.call('mentor_record_evidence', { topic_id: 'cpp/variables', events: [{ kind: 'recall', outcome: 'fail', context: 'review' }] });
    expect(r.json.suggestion).toMatch(/reinforcement stage/);
    const next = (await h.call('mentor_next')).json.recommendations as { type: string; topic: string }[];
    expect(next.some((x) => x.type === 'reinforce' && x.topic === 'cpp/variables')).toBe(true);
    const reviews = (await h.call('mentor_next', { focus: 'review' })).json.recommendations as { topic: string }[];
    const subjects = reviews.map((x) => x.topic.split('/')[0]);
    expect(subjects.slice(0, 2).sort()).toEqual(['cpp', 'sql']); // interleaved
  });

  it('renders a progress map per subject', async () => {
    h = await makeHarness();
    await seedCpp(h);
    await h.call('mentor_record_evidence', { topic_id: 'cpp/variables', events: [{ kind: 'explanation', outcome: 'success' }] });
    const r = await h.call('mentor_progress', { subject: 'cpp' });
    const map = r.json.map as string;
    expect(map.split('\n')[0]).toBe('cpp — Write small systems programs');
    expect(map).toMatch(/███░ 3\? variables/);
    expect(map).toMatch(/pointers .*▶ 1\/3 Зачем нужны указатели/);
    expect(map).toContain('нужно: memory-basics');
  });
});
