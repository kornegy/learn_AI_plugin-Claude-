/**
 * Data root resolution and the path guard. Every path the server touches is built here
 * from validated ids and checked to stay inside the root (docs/ARCHITECTURE.md §10.2).
 */
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { MentorError } from '../core/errors.js';
import { assertSlug } from '../core/ids.js';

export const ROOT_ENV = 'LEARNING_MENTOR_HOME';

/** The filesystem root, the home folder and their ancestors are never valid data roots or workspaces. */
export function isTooBroad(p: string): boolean {
  const abs = path.resolve(p);
  if (abs === path.parse(abs).root) return true;
  const home = path.resolve(os.homedir());
  return isInside(abs, home); // abs is home itself or one of its ancestors
}

export function resolveRoot(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env[ROOT_ENV]?.trim();
  if (fromEnv) {
    if (!path.isAbsolute(fromEnv)) {
      throw new MentorError('E_PATH', `${ROOT_ENV} must be an absolute path, got "${fromEnv}".`);
    }
    const abs = path.resolve(fromEnv);
    if (isTooBroad(abs)) {
      throw new MentorError('E_PATH', `${ROOT_ENV}="${abs}" is not a safe data folder (filesystem root or home folder). Use a dedicated folder such as ~/LearningMentor.`);
    }
    return abs;
  }
  return path.join(os.homedir(), 'LearningMentor');
}

export const DIRS = {
  profile: 'learner-profile',
  subjects: 'learner-profile/subjects',
  knowledge: 'knowledge-base',
  paths: 'learning-paths',
  research: 'research-library',
  meta: '.mentor',
  journal: '.mentor/journal',
  backups: '.mentor/backups',
  trash: '.mentor/trash',
  quarantine: '.mentor/quarantine',
} as const;

/** Relative paths of documents, built only from validated ids. */
export const rel = {
  readme: () => 'README.md',
  config: () => `${DIRS.meta}/config.yaml`,
  meta: () => `${DIRS.meta}/meta.yaml`,
  lock: () => `${DIRS.meta}/lock`,
  profile: () => `${DIRS.profile}/profile.md`,
  preferences: () => `${DIRS.profile}/learning-preferences.md`,
  subject: (subject: string) => `${DIRS.subjects}/${assertSlug('subject', subject)}.md`,
  topic: (subject: string, slug: string) => `${DIRS.knowledge}/${assertSlug('subject', subject)}/${assertSlug('topic', slug)}.md`,
  subjectPath: (subject: string) => `${DIRS.paths}/${assertSlug('subject', subject)}/_path.md`,
  topicPath: (subject: string, slug: string) => `${DIRS.paths}/${assertSlug('subject', subject)}/${assertSlug('topic', slug)}.md`,
  source: (subject: string, slug: string) => `${DIRS.research}/${assertSlug('subject', subject)}/${assertSlug('source', slug)}.md`,
};

export class PathGuard {
  constructor(readonly root: string) {}

  /** Resolves a root-relative path and verifies it stays inside the root. */
  resolve(relPath: string): string {
    if (path.isAbsolute(relPath)) throw new MentorError('E_PATH', `Absolute paths are not accepted: ${relPath}`);
    const abs = path.resolve(this.root, relPath);
    const r = path.relative(this.root, abs);
    if (r === '' || r.startsWith('..') || path.isAbsolute(r)) {
      throw new MentorError('E_PATH', `Path escapes the data root: ${relPath}`);
    }
    return abs;
  }

  /**
   * Refuses to write through symlinks: checks every existing component between the root and
   * the target. Missing components are fine (they will be created as real directories).
   */
  async assertWritable(relPath: string): Promise<string> {
    const abs = this.resolve(relPath);
    const parts = path.relative(this.root, abs).split(path.sep);
    let cur = this.root;
    for (const part of parts) {
      cur = path.join(cur, part);
      try {
        const st = await fs.lstat(cur);
        if (st.isSymbolicLink()) throw new MentorError('E_PATH', `Refusing to write through a symbolic link: ${path.relative(this.root, cur)}`);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') break;
        throw e;
      }
    }
    return abs;
  }

  /** For reads: symlinks are followed only if their real target is inside the root. */
  async assertReadable(relPath: string): Promise<string> {
    const abs = this.resolve(relPath);
    try {
      const real = await fs.realpath(abs);
      const realRoot = await fs.realpath(this.root);
      const r = path.relative(realRoot, real);
      if (r.startsWith('..') || path.isAbsolute(r)) throw new MentorError('E_PATH', `Refusing to read outside the data root: ${relPath}`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    return abs;
  }
}

/** Real path of a directory, or its normalised absolute path if it does not exist. */
export async function realOrResolved(p: string): Promise<string> {
  try {
    return await fs.realpath(p);
  } catch {
    return path.resolve(p);
  }
}

/** True if `child` is `parent` or inside it (case-insensitive on Windows and macOS). */
export function isInside(parent: string, child: string): boolean {
  const ci = process.platform === 'win32' || process.platform === 'darwin';
  const p = ci ? parent.toLowerCase() : parent;
  const c = ci ? child.toLowerCase() : child;
  const r = path.relative(p, c);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
}
