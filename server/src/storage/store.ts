/**
 * Typed document store over the data root. The only module (with fsx/journal/lock) that
 * touches the filesystem. Validates on every read and never overwrites a corrupt file.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';
import YAML from 'yaml';
import { MentorError } from '../core/errors.js';
import { isSlug } from '../core/ids.js';
import { DATA_SCHEMA, formatZodError, ConfigSchema, MetaSchema, type Config, type Meta } from '../schema/index.js';
import { atomicWrite, copyDir, exists, listDirs, listFiles, readText } from './fsx.js';
import { Journal } from './journal.js';
import { withLock } from './lock.js';
import { parseDoc, serializeDoc, type MarkdownDoc } from './markdown.js';
import { DIRS, PathGuard, rel } from './root.js';

function isOwnDocName(file: string): boolean {
  if (!file.endsWith('.md')) return false;
  const base = file.slice(0, -3);
  return base === '_path' || isSlug(base);
}

export interface LoadedDoc<T> {
  data: T;
  doc: MarkdownDoc;
  relPath: string;
}

/** Derived, disposable cache of parsed frontmatter: YAML parsing dominates bulk loads. */
interface FmEntry {
  ino: number;
  size: number;
  mtimeMs: number;
  fm: unknown;
}
const CACHE_REL = `${DIRS.meta}/cache/frontmatter.json`;
const CACHE_VERSION = 1;

export class Store {
  readonly guard: PathGuard;
  readonly journal: Journal;
  private fmCache: Map<string, FmEntry> | null = null;
  private fmDirty = false;

  constructor(readonly root: string) {
    this.guard = new PathGuard(root);
    this.journal = new Journal(path.join(root, DIRS.journal));
  }

  abs(relPath: string): string {
    return this.guard.resolve(relPath);
  }

  async isInitialized(): Promise<boolean> {
    return exists(path.join(this.root, rel.meta()));
  }

  async assertInitialized(): Promise<void> {
    if (!(await this.isInitialized())) {
      throw new MentorError(
        'E_NOT_INITIALIZED',
        `Learning Mentor is not set up yet (no data at ${this.root}). Suggest running /learning-mentor:start, or call mentor_init.`,
      );
    }
  }

  lock<T>(fn: () => Promise<T>): Promise<T> {
    return withLock(path.join(this.root, rel.lock()), fn);
  }

  // ------------------------------------------------------------ YAML files

  async readConfig(): Promise<Config> {
    const text = await readText(await this.guard.assertReadable(rel.config()));
    if (text === null) return ConfigSchema.parse({});
    let raw: unknown;
    try {
      raw = YAML.parse(text, { schema: 'core', logLevel: 'error' }) ?? {};
    } catch (e) {
      throw new MentorError('E_CORRUPT', `${rel.config()}: not valid YAML (${(e as Error).message.split('\n')[0]}). Run mentor_doctor.`, {
        path: rel.config(),
      });
    }
    const parsed = ConfigSchema.safeParse(raw);
    if (!parsed.success) {
      throw new MentorError('E_CORRUPT', `${rel.config()}: ${formatZodError(parsed.error)}. Fix the value or run mentor_settings.`, {
        path: rel.config(),
      });
    }
    if (parsed.data.schema > DATA_SCHEMA) this.tooNew(rel.config(), parsed.data.schema);
    return parsed.data;
  }

  async writeConfig(config: Config): Promise<void> {
    await this.writeYaml(rel.config(), ConfigSchema.parse(config), '# Learning Mentor settings. Edit with /learning-mentor:settings.\n');
  }

  async readMeta(): Promise<Meta | null> {
    const text = await readText(await this.guard.assertReadable(rel.meta()));
    if (text === null) return null;
    const parsed = MetaSchema.safeParse(YAML.parse(text, { schema: 'core', logLevel: 'error' }));
    if (!parsed.success) throw new MentorError('E_CORRUPT', `${rel.meta()}: ${formatZodError(parsed.error)}.`, { path: rel.meta() });
    if (parsed.data.data_schema > DATA_SCHEMA) this.tooNew(rel.meta(), parsed.data.data_schema);
    return parsed.data;
  }

  async writeMeta(meta: Meta): Promise<void> {
    await this.writeYaml(rel.meta(), meta);
  }

  private async writeYaml(relPath: string, data: unknown, header = ''): Promise<void> {
    const abs = await this.guard.assertWritable(relPath);
    await atomicWrite(abs, header + YAML.stringify(data, { lineWidth: 0 }));
  }

  private tooNew(relPath: string, version: number): never {
    throw new MentorError(
      'E_SCHEMA_TOO_NEW',
      `${relPath} uses data schema ${version}, but this plugin understands schema ${DATA_SCHEMA}. Update the learning-mentor plugin; nothing was changed.`,
      { path: relPath },
    );
  }

  // ------------------------------------------------------------ Markdown documents

  /** Reads and validates a document. Returns null if missing; throws E_CORRUPT if invalid. */
  async readDoc<S extends z.ZodType>(relPath: string, schema: S): Promise<LoadedDoc<z.infer<S>> | null> {
    const text = await readText(await this.guard.assertReadable(relPath));
    if (text === null) return null;
    let doc: MarkdownDoc;
    try {
      doc = parseDoc(text, relPath);
    } catch (e) {
      if (e instanceof MentorError) throw new MentorError(e.code, `${e.message} Run mentor_doctor with repair: true.`, e.details);
      throw e;
    }
    const fm = doc.frontmatter as { schema?: unknown };
    if (typeof fm?.schema === 'number' && fm.schema > DATA_SCHEMA) this.tooNew(relPath, fm.schema);
    const parsed = schema.safeParse(doc.frontmatter);
    if (!parsed.success) {
      throw new MentorError('E_CORRUPT', `${relPath}: invalid frontmatter (${formatZodError(parsed.error)}). Run mentor_doctor with repair: true.`, {
        path: relPath,
      });
    }
    return { data: parsed.data, doc, relPath };
  }

  /**
   * Frontmatter only, through the cache (keyed by inode, size and mtime: every atomic write makes a
   * new inode). Falls back to a full read and validation when the entry is missing or stale.
   */
  async readDataCached<S extends z.ZodType>(relPath: string, schema: S): Promise<{ data: z.infer<S>; relPath: string } | null> {
    const cache = await this.loadFmCache();
    let st;
    try {
      st = await fs.stat(await this.guard.assertReadable(relPath));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
    const hit = cache.get(relPath);
    if (hit && hit.ino === st.ino && hit.size === st.size && hit.mtimeMs === st.mtimeMs) {
      const parsed = schema.safeParse(hit.fm);
      if (parsed.success) return { data: parsed.data, relPath };
    }
    const loaded = await this.readDoc(relPath, schema);
    if (!loaded) return null;
    cache.set(relPath, { ino: st.ino, size: st.size, mtimeMs: st.mtimeMs, fm: loaded.data });
    this.fmDirty = true;
    return { data: loaded.data, relPath };
  }

  private async loadFmCache(): Promise<Map<string, FmEntry>> {
    if (this.fmCache) return this.fmCache;
    this.fmCache = new Map();
    try {
      const raw = JSON.parse(await fs.readFile(this.guard.resolve(CACHE_REL), 'utf8')) as { v?: number; entries?: Record<string, FmEntry> };
      if (raw.v === CACHE_VERSION && raw.entries && typeof raw.entries === 'object') {
        for (const [k, v] of Object.entries(raw.entries)) if (v && typeof v === 'object') this.fmCache.set(k, v);
      }
    } catch {
      /* missing or unreadable cache: rebuilt on demand */
    }
    return this.fmCache;
  }

  /** Writes the cache if it changed, dropping entries whose files no longer exist. Best effort. */
  async flushCache(): Promise<void> {
    if (!this.fmCache || !this.fmDirty) return;
    const entries: Record<string, FmEntry> = {};
    for (const [k, v] of this.fmCache) if (await exists(this.guard.resolve(k))) entries[k] = v;
    try {
      await atomicWrite(await this.guard.assertWritable(CACHE_REL), JSON.stringify({ v: CACHE_VERSION, entries }));
      this.fmDirty = false;
    } catch {
      /* the cache is optional */
    }
  }

  /** Forget the cache (after deletions, so removed data does not linger there). */
  async dropCache(): Promise<void> {
    this.fmCache = null;
    this.fmDirty = false;
    await fs.rm(this.guard.resolve(CACHE_REL), { force: true });
  }

  async writeDoc<S extends z.ZodType>(relPath: string, schema: S, data: z.infer<S>, doc: MarkdownDoc): Promise<void> {
    const validated = schema.parse(data);
    const abs = await this.guard.assertWritable(relPath);
    await atomicWrite(abs, serializeDoc({ ...doc, frontmatter: validated }));
  }

  async writeText(relPath: string, text: string): Promise<void> {
    await atomicWrite(await this.guard.assertWritable(relPath), text);
  }

  async exists(relPath: string): Promise<boolean> {
    return exists(this.guard.resolve(relPath));
  }

  /** Subject folders: only kebab-case names are ours; anything else is ignored. */
  async listSubjectsIn(dir: string): Promise<string[]> {
    return (await listDirs(this.guard.resolve(dir))).filter(isSlug);
  }

  /** Documents: only "<slug>.md" (and "_path.md") are ours. Other names are never echoed back. */
  async listDocs(relDir: string): Promise<string[]> {
    return (await listFiles(this.guard.resolve(relDir), '.md')).filter(isOwnDocName).map((f) => `${relDir}/${f}`);
  }

  /** Number of files and folders with names the plugin does not use (for doctor; names are not returned). */
  async countUnexpected(relDir: string): Promise<number> {
    const abs = this.guard.resolve(relDir);
    const files = (await listFiles(abs, '')).filter((f) => !isOwnDocName(f));
    const dirs = (await listDirs(abs)).filter((d) => !isSlug(d));
    return files.length + dirs.length;
  }

  // ------------------------------------------------------------ backups, trash, quarantine

  private stamp(now: Date): string {
    return now.toISOString().replace(/[:.]/g, '-');
  }

  /** Copies the given files (that exist) to .mentor/backups/<stamp>-<reason>/, keeping the last 20. */
  async backup(relPaths: string[], reason: string, now: Date): Promise<string | null> {
    const existing: string[] = [];
    for (const p of relPaths) if (await this.exists(p)) existing.push(p);
    if (!existing.length) return null;
    const dirRel = `${DIRS.backups}/${this.stamp(now)}-${reason}`;
    for (const p of existing) {
      const dest = this.guard.resolve(`${dirRel}/${p}`);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(this.guard.resolve(p), dest);
    }
    await this.prune(DIRS.backups, 20);
    return dirRel;
  }

  /** Moves files or directories into .mentor/<area>/<stamp>/ preserving relative paths. */
  async moveAside(relPaths: string[], area: 'trash' | 'quarantine', now: Date): Promise<string> {
    const dirRel = `${area === 'trash' ? DIRS.trash : DIRS.quarantine}/${this.stamp(now)}`;
    for (const p of relPaths) {
      const src = this.guard.resolve(p);
      if (!(await exists(src))) continue;
      const dest = this.guard.resolve(`${dirRel}/${p}`);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.rename(src, dest);
    }
    return dirRel;
  }

  async remove(relPath: string): Promise<void> {
    await fs.rm(this.guard.resolve(relPath), { recursive: true, force: true });
  }

  /** Deletes trash folders older than maxAgeDays. Returns how many were removed. */
  async pruneTrash(now: Date, maxAgeDays = 30): Promise<number> {
    let removed = 0;
    for (const name of await listDirs(this.guard.resolve(DIRS.trash))) {
      const st = await fs.stat(this.guard.resolve(`${DIRS.trash}/${name}`));
      if (now.getTime() - st.mtimeMs > maxAgeDays * 86_400_000) {
        await this.remove(`${DIRS.trash}/${name}`);
        removed++;
      }
    }
    return removed;
  }

  private async prune(dirRel: string, keep: number): Promise<void> {
    const dirs = await listDirs(this.guard.resolve(dirRel));
    for (const name of dirs.slice(0, Math.max(0, dirs.length - keep))) await this.remove(`${dirRel}/${name}`);
  }

  async copyRootTo(destAbs: string): Promise<number> {
    return copyDir(this.root, destAbs, (r) => r === rel.lock() || r.startsWith(`${DIRS.trash}`) || r.startsWith(`${DIRS.meta}/cache`) || r.includes('.tmp-'));
  }
}
