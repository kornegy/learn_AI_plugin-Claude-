/** Single advisory lock for the whole data root (ARCHITECTURE §10.3). */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MentorError } from '../core/errors.js';

export interface LockOptions {
  timeoutMs?: number;
  staleMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Returns the lock file's content if the lock is stale (old and its process is gone), else null. */
async function staleContent(lockPath: string, staleMs: number): Promise<string | null> {
  try {
    const st = await fs.stat(lockPath);
    if (Date.now() - st.mtimeMs < staleMs) return null;
    const content = await fs.readFile(lockPath, 'utf8');
    try {
      const info = JSON.parse(content) as { pid?: number; host?: string };
      if (info.host === os.hostname() && typeof info.pid === 'number' && pidAlive(info.pid)) return null;
    } catch {
      /* unreadable content: an interrupted write long ago; treat as stale */
    }
    return content;
  } catch {
    return null; // vanished: just retry the O_EXCL create
  }
}

/**
 * Takes over a stale lock safely when several processes race: the stale file is moved away with
 * an atomic rename, and if what was moved turns out to be someone's fresh lock (they took over
 * first), it is restored with an atomic link that fails if a lock already exists.
 */
async function breakStaleLock(lockPath: string, expected: string): Promise<void> {
  const aside = `${lockPath}.stale-${process.pid}-${Math.random().toString(36).slice(2)}`;
  try {
    await fs.rename(lockPath, aside);
  } catch {
    return; // someone else moved it already
  }
  const moved = await fs.readFile(aside, 'utf8').catch(() => expected);
  if (moved !== expected) {
    await fs.link(aside, lockPath).catch(() => undefined);
  }
  await fs.rm(aside, { force: true });
}

export async function withLock<T>(lockPath: string, fn: () => Promise<T>, opts: LockOptions = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const staleMs = opts.staleMs ?? 30_000;
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  let delay = 10;
  for (;;) {
    try {
      const handle = await fs.open(lockPath, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, host: os.hostname(), started: new Date().toISOString() }));
      await handle.close();
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      const stale = await staleContent(lockPath, staleMs);
      if (stale !== null) {
        await breakStaleLock(lockPath, stale);
        continue;
      }
      if (Date.now() > deadline) {
        throw new MentorError('E_LOCKED', 'Another Claude session is writing learning data right now. Retry in a moment.');
      }
      await sleep(delay);
      delay = Math.min(delay * 2, 200);
    }
  }
  try {
    return await fn();
  } finally {
    await fs.rm(lockPath, { force: true });
  }
}
