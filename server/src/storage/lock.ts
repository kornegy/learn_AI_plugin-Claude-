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

/**
 * Windows reports a file in "delete pending" state (deleted while another process still has it
 * open, e.g. reading it) with EPERM/EACCES/EBUSY instead of EEXIST/ENOENT. Those are transient.
 */
function isTransient(e: unknown): boolean {
  const code = (e as NodeJS.ErrnoException).code;
  return code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
}

/** rm that tolerates transient Windows errors with a few retries; never throws. */
async function removeQuietly(p: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await fs.rm(p, { force: true });
      return;
    } catch (e) {
      if (!isTransient(e)) return;
      await sleep(10 * (attempt + 1));
    }
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
 * Breaks a stale lock so that racing processes can never both end up holding the lock.
 * Only one process at a time may break (it holds `<lock>.break`, created with O_EXCL). It re-reads
 * the lock and deletes it only if it still holds the stale content seen before. A fresh lock
 * cannot appear in between: the path is only freed by this very deletion.
 */
async function breakStaleLock(lockPath: string, expected: string, staleMs: number): Promise<void> {
  const breaker = `${lockPath}.break`;
  try {
    const handle = await fs.open(breaker, 'wx');
    await handle.close();
  } catch (e) {
    if (isTransient(e)) return; // a breaker is being removed right now (Windows): retry later
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    // Another process is breaking right now; a breaker left behind by a crash expires.
    try {
      const st = await fs.stat(breaker);
      if (Date.now() - st.mtimeMs > staleMs) await removeQuietly(breaker);
    } catch {
      /* gone already */
    }
    return;
  }
  try {
    const current = await fs.readFile(lockPath, 'utf8').catch(() => null);
    if (current === expected) await removeQuietly(lockPath);
  } finally {
    await removeQuietly(breaker);
  }
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
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST' && !isTransient(e)) throw e;
      if (code === 'EEXIST') {
        const stale = await staleContent(lockPath, staleMs);
        if (stale !== null) {
          await breakStaleLock(lockPath, stale, staleMs);
          continue;
        }
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
    await removeQuietly(lockPath);
  }
}
