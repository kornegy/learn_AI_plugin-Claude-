import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseDoc, serializeDoc, setSection, appendToSection, getSection, SECTION_LIMIT } from '../../src/storage/markdown.js';
import { PathGuard, resolveRoot, rel, isInside } from '../../src/storage/root.js';
import { atomicWrite, readText } from '../../src/storage/fsx.js';
import { withLock } from '../../src/storage/lock.js';
import { Journal } from '../../src/storage/journal.js';
import { Store } from '../../src/storage/store.js';
import { TopicSchema } from '../../src/schema/index.js';
import { isSlug, parseQualifiedId, ulid } from '../../src/core/ids.js';
import { MentorError } from '../../src/core/errors.js';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-storage-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

const sample = `---
schema: 1
kind: topic
title: "Указатели"
---

Free text written by the learner.

<!-- mentor:section summary -->
## Кратко
A pointer stores an address.
<!-- mentor:end -->

<!-- mentor:section studied -->
## Что уже изучено
- 2026-10-20 · why pointers
<!-- mentor:end -->

Trailing free text.
`;

describe('markdown documents', () => {
  it('parses frontmatter, sections and free text', () => {
    const doc = parseDoc(sample);
    expect(doc.frontmatter).toMatchObject({ schema: 1, kind: 'topic', title: 'Указатели' });
    expect(getSection(doc, 'summary')?.content).toBe('A pointer stores an address.');
    expect(getSection(doc, 'summary')?.heading).toBe('Кратко');
    const texts = doc.segments.filter((s) => s.type === 'text').map((s) => (s as { text: string }).text.trim());
    expect(texts).toContain('Free text written by the learner.');
    expect(texts).toContain('Trailing free text.');
  });

  it('serialisation is a fixed point after the first write', () => {
    const once = serializeDoc(parseDoc(sample));
    const twice = serializeDoc(parseDoc(once));
    expect(twice).toBe(once);
    expect(once).toContain('Free text written by the learner.');
    expect(once).toContain('Trailing free text.');
  });

  it('keeps a learner-edited heading when replacing content', () => {
    const doc = parseDoc(sample);
    setSection(doc, 'summary', 'Summary', 'New summary');
    expect(getSection(doc, 'summary')).toMatchObject({ heading: 'Кратко', content: 'New summary' });
  });

  it('creates missing sections at the end', () => {
    const doc = parseDoc(sample);
    setSection(doc, 'gaps', 'Gaps', '- pointer arithmetic');
    const out = serializeDoc(doc);
    expect(out.indexOf('mentor:section gaps')).toBeGreaterThan(out.indexOf('Trailing free text.'));
  });

  it('archives the oldest bullets when a section exceeds the limit', () => {
    const doc = parseDoc(sample);
    const line = 'x'.repeat(1000);
    for (let i = 0; i < 12; i++) appendToSection(doc, 'studied', 'Studied', [`${i} ${line}`], 'Archive');
    const studied = getSection(doc, 'studied')!;
    expect(studied.content.length).toBeLessThanOrEqual(SECTION_LIMIT);
    const archive = getSection(doc, 'studied-archive')!;
    expect(archive.content).toContain('2026-10-20 · why pointers');
    expect(archive.content).toContain('- 0 ');
    expect(studied.content).toContain('- 11 ');
  });

  it.each([
    ['no frontmatter', 'just text'],
    ['unclosed frontmatter', '---\nschema: 1\n'],
    ['invalid yaml', '---\nschema: [1\n---\n'],
    ['unclosed section', '---\nschema: 1\n---\n<!-- mentor:section a -->\n## A\ntext\n'],
    ['orphan end marker', '---\nschema: 1\n---\ntext\n<!-- mentor:end -->\n'],
    ['duplicate keys', '---\nschema: 1\nschema: 2\n---\n'],
  ])('rejects %s as corrupt', (_name, text) => {
    expect(() => parseDoc(text)).toThrowError(MentorError);
    try {
      parseDoc(text);
    } catch (e) {
      expect((e as MentorError).code).toBe('E_CORRUPT');
    }
  });

  it('accepts CRLF line endings', () => {
    const doc = parseDoc(sample.replace(/\n/g, '\r\n'));
    expect(getSection(doc, 'summary')?.content).toBe('A pointer stores an address.');
  });
});

describe('ids', () => {
  it.each(['cpp', 'memory-basics', 'a1', 'sql'])('accepts %s', (s) => expect(isSlug(s)).toBe(true));
  it.each(['', 'Cpp', 'memory_basics', '-x', 'x-', 'a--b', 'con', 'nul', '_path', '../x', 'a/b', 'указатели', 'a'.repeat(49)])(
    'rejects %s',
    (s) => expect(isSlug(s)).toBe(false),
  );
  it('parses qualified ids', () => {
    expect(parseQualifiedId('topic', 'cpp/pointers')).toEqual({ subject: 'cpp', slug: 'pointers' });
    expect(() => parseQualifiedId('topic', 'cpp/../x')).toThrow(MentorError);
    expect(() => parseQualifiedId('topic', 'cpp')).toThrow(MentorError);
  });
  it('generates sortable unique ulids', () => {
    const a = ulid(new Date(1000));
    const b = ulid(new Date(2000));
    expect(a).toHaveLength(26);
    expect(a < b).toBe(true);
    expect(ulid()).not.toBe(ulid());
  });
});

describe('path guard', () => {
  it('resolves paths inside the root and rejects escapes', () => {
    const g = new PathGuard(tmp);
    expect(g.resolve('knowledge-base/cpp/pointers.md')).toBe(path.join(tmp, 'knowledge-base/cpp/pointers.md'));
    expect(() => g.resolve('../outside.md')).toThrow(MentorError);
    expect(() => g.resolve('a/../../outside.md')).toThrow(MentorError);
    expect(() => g.resolve('/etc/passwd')).toThrow(MentorError);
    expect(() => g.resolve('')).toThrow(MentorError);
  });

  it('builds document paths only from valid ids', () => {
    expect(rel.topic('cpp', 'pointers')).toBe('knowledge-base/cpp/pointers.md');
    expect(() => rel.topic('cpp', '../../x')).toThrow(MentorError);
    expect(() => rel.topic('CPP', 'x')).toThrow(MentorError);
  });

  it.skipIf(process.platform === 'win32')('refuses to write through symlinks', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-outside-'));
    await fs.mkdir(path.join(tmp, 'knowledge-base'), { recursive: true });
    await fs.symlink(outside, path.join(tmp, 'knowledge-base', 'cpp'));
    const g = new PathGuard(tmp);
    await expect(g.assertWritable('knowledge-base/cpp/pointers.md')).rejects.toThrow(/symbolic link/);
    await expect(g.assertReadable('knowledge-base/cpp/pointers.md')).resolves.toBeTruthy(); // missing target is fine
    await fs.writeFile(path.join(outside, 'secret.md'), 'x');
    await expect(g.assertReadable('knowledge-base/cpp/secret.md')).rejects.toThrow(/outside/);
    await fs.rm(outside, { recursive: true, force: true });
  });

  it('resolves the root from the environment', () => {
    expect(resolveRoot({ LEARNING_MENTOR_HOME: tmp })).toBe(tmp);
    expect(() => resolveRoot({ LEARNING_MENTOR_HOME: 'relative/path' })).toThrow(MentorError);
    expect(resolveRoot({})).toBe(path.join(os.homedir(), 'LearningMentor'));
  });

  it('checks workspace containment', () => {
    expect(isInside('/home/u/learn', '/home/u/learn')).toBe(true);
    expect(isInside('/home/u/learn', '/home/u/learn/cpp/ex1')).toBe(true);
    expect(isInside('/home/u/learn', '/home/u/learning')).toBe(false);
    expect(isInside('/home/u/learn', '/home/u')).toBe(false);
  });
});

describe('fs helpers', () => {
  it('writes atomically and leaves no temp files', async () => {
    const p = path.join(tmp, 'a', 'b.md');
    await atomicWrite(p, 'one');
    await atomicWrite(p, 'two');
    expect(await readText(p)).toBe('two');
    expect(await fs.readdir(path.join(tmp, 'a'))).toEqual(['b.md']);
  });

  it('refuses oversized files', async () => {
    const p = path.join(tmp, 'big.md');
    await fs.writeFile(p, 'x'.repeat(2048));
    await expect(readText(p, 1024)).rejects.toMatchObject({ code: 'E_CORRUPT' });
    expect(await readText(path.join(tmp, 'missing.md'))).toBeNull();
  });
});

describe('lock', () => {
  it('serialises concurrent critical sections', async () => {
    const lockPath = path.join(tmp, '.mentor', 'lock');
    const order: string[] = [];
    const task = (name: string) =>
      withLock(lockPath, async () => {
        order.push(`${name}:start`);
        await new Promise((r) => setTimeout(r, 30));
        order.push(`${name}:end`);
      });
    await Promise.all([task('a'), task('b'), task('c')]);
    for (let i = 0; i < order.length; i += 2) expect(order[i]!.split(':')[0]).toBe(order[i + 1]!.split(':')[0]);
    await expect(fs.stat(lockPath)).rejects.toBeTruthy();
  });

  it('takes over a stale lock from a dead process', async () => {
    const lockPath = path.join(tmp, 'lock');
    await fs.writeFile(lockPath, JSON.stringify({ pid: 999999, host: os.hostname() }));
    const old = new Date(Date.now() - 60_000);
    await fs.utimes(lockPath, old, old);
    await expect(withLock(lockPath, async () => 'ok', { timeoutMs: 500 })).resolves.toBe('ok');
  });

  it('times out on a live lock', async () => {
    const lockPath = path.join(tmp, 'lock');
    await fs.writeFile(lockPath, JSON.stringify({ pid: process.pid, host: os.hostname() }));
    await expect(withLock(lockPath, async () => 'ok', { timeoutMs: 100 })).rejects.toMatchObject({ code: 'E_LOCKED' });
  });
});

describe('journal', () => {
  const ev = (day: string, type: string, topic?: string) => ({
    v: 1 as const,
    id: ulid(new Date(`${day}T10:00:00Z`)),
    ts: `${day}T10:00:00+00:00`,
    day,
    type,
    ...(topic ? { topic } : {}),
    data: {},
  });

  it('appends to monthly files and reads back in order', async () => {
    const j = new Journal(path.join(tmp, 'journal'));
    await j.append([ev('2026-11-02', 'b'), ev('2026-10-31', 'a')]);
    await j.append([ev('2026-11-03', 'c')]);
    expect((await fs.readdir(path.join(tmp, 'journal'))).sort()).toEqual(['2026-10.jsonl', '2026-11.jsonl']);
    const { events, badLines } = await j.readAll();
    expect(events.map((e) => e.type)).toEqual(['a', 'b', 'c']);
    expect(badLines).toEqual([]);
  });

  it('skips and reports corrupt lines', async () => {
    const dir = path.join(tmp, 'journal');
    const j = new Journal(dir);
    await j.append([ev('2026-11-02', 'ok')]);
    await fs.appendFile(path.join(dir, '2026-11.jsonl'), '{not json\n{"v":2}\n');
    const { events, badLines } = await j.readAll();
    expect(events).toHaveLength(1);
    expect(badLines).toHaveLength(2);
  });

  it('removes events for purge', async () => {
    const j = new Journal(path.join(tmp, 'journal'));
    await j.append([ev('2026-11-01', 'x', 'cpp/a'), ev('2026-11-01', 'x', 'cpp/b')]);
    expect(await j.remove((e) => e.topic === 'cpp/a')).toBe(1);
    expect((await j.readAll()).events.map((e) => e.topic)).toEqual(['cpp/b']);
  });
});

describe('store', () => {
  const topicDoc = `---
schema: 1
kind: topic
id: cpp/pointers
subject: cpp
title: Pointers
created: 2026-10-20
updated: 2026-10-20
future_field: kept
---
`;

  it('validates documents and preserves unknown fields', async () => {
    const store = new Store(tmp);
    await fs.mkdir(path.join(tmp, 'knowledge-base/cpp'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'knowledge-base/cpp/pointers.md'), topicDoc);
    const loaded = await store.readDoc(rel.topic('cpp', 'pointers'), TopicSchema);
    expect(loaded?.data.level).toBeNull();
    expect((loaded?.data as Record<string, unknown>).future_field).toBe('kept');
    await store.writeDoc(rel.topic('cpp', 'pointers'), TopicSchema, loaded!.data, loaded!.doc);
    expect(await fs.readFile(path.join(tmp, 'knowledge-base/cpp/pointers.md'), 'utf8')).toContain('future_field: kept');
  });

  it('reports invalid frontmatter as corrupt and newer schemas as too new', async () => {
    const store = new Store(tmp);
    await fs.mkdir(path.join(tmp, 'knowledge-base/cpp'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'knowledge-base/cpp/pointers.md'), topicDoc.replace('kind: topic', 'kind: other'));
    await expect(store.readDoc(rel.topic('cpp', 'pointers'), TopicSchema)).rejects.toMatchObject({ code: 'E_CORRUPT' });
    await fs.writeFile(path.join(tmp, 'knowledge-base/cpp/pointers.md'), topicDoc.replace('schema: 1', 'schema: 2'));
    await expect(store.readDoc(rel.topic('cpp', 'pointers'), TopicSchema)).rejects.toMatchObject({ code: 'E_SCHEMA_TOO_NEW' });
  });

  it('backs up, moves aside and prunes', async () => {
    const store = new Store(tmp);
    await store.writeText('knowledge-base/cpp/a.md', 'a');
    const backup = await store.backup(['knowledge-base/cpp/a.md', 'missing.md'], 'test', new Date());
    expect(await fs.readFile(path.join(tmp, backup!, 'knowledge-base/cpp/a.md'), 'utf8')).toBe('a');
    const trash = await store.moveAside(['knowledge-base/cpp/a.md'], 'trash', new Date());
    expect(await store.exists('knowledge-base/cpp/a.md')).toBe(false);
    expect(await fs.readFile(path.join(tmp, trash, 'knowledge-base/cpp/a.md'), 'utf8')).toBe('a');
    const old = new Date(Date.now() - 40 * 86_400_000);
    await fs.utimes(path.join(tmp, trash), old, old);
    expect(await store.pruneTrash(new Date())).toBe(1);
  });
});
