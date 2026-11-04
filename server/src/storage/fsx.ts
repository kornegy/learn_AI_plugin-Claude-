/** Low-level filesystem helpers: bounded reads, atomic writes, directory copies. */
import { promises as fs, constants as fsc } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { MentorError } from '../core/errors.js';

export const MAX_READ_BYTES = 512 * 1024;

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch {
    return false;
  }
}

/** Reads a UTF-8 file; returns null if it does not exist. Rejects oversized files. */
export async function readText(p: string, maxBytes = MAX_READ_BYTES): Promise<string | null> {
  let stat;
  try {
    stat = await fs.stat(p);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  if (stat.size > maxBytes) {
    throw new MentorError('E_CORRUPT', `File is larger than ${Math.round(maxBytes / 1024)} KB and was not loaded: ${p}. Run mentor_doctor.`, {
      path: p,
    });
  }
  return fs.readFile(p, 'utf8');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Writes via temp file + fsync + rename in the same directory, so readers never see partial content. */
export async function atomicWrite(p: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  const handle = await fs.open(tmp, 'w');
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, p);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      // Windows: the target can be briefly locked by antivirus or another reader.
      if ((code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') && attempt < 5) {
        await sleep(20 * (attempt + 1));
        continue;
      }
      await fs.rm(tmp, { force: true });
      throw e;
    }
  }
}

/** Appends text and fsyncs. Used for the journal. */
export async function appendDurable(p: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  const handle = await fs.open(p, fsc.O_WRONLY | fsc.O_APPEND | fsc.O_CREAT, 0o600);
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/** Recursively copies a directory (regular files and folders only; symlinks are skipped). */
export async function copyDir(src: string, dest: string, skip: (rel: string) => boolean = () => false, rel = ''): Promise<number> {
  await fs.mkdir(dest, { recursive: true });
  let count = 0;
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (skip(childRel)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) count += await copyDir(s, d, skip, childRel);
    else if (entry.isFile()) {
      await fs.copyFile(s, d);
      count++;
    }
  }
  return count;
}

export async function listFiles(dir: string, ext: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && e.name.endsWith(ext)).map((e) => e.name).sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

export async function listDirs(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

/** Counts regular files under a directory. */
export async function countFiles(dir: string): Promise<number> {
  let n = 0;
  try {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) n += await countFiles(path.join(dir, entry.name));
      else if (entry.isFile()) n++;
    }
  } catch {
    /* missing directory counts as empty */
  }
  return n;
}
