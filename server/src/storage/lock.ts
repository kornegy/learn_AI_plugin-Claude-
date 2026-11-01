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

async function isStale(lockPath: string, staleMs: number): Promise<boolean> {
  try {
    const st = await fs.stat(lockPath);
    if (Date.now() - st.mtimeMs < staleMs) return false;
    const info = JSON.parse(await fs.readFile(lockPath, 'utf8')) as { pid?: number; host?: string };
    if (info.host === os.hostname() && typeof info.pid === 'number' && pidAlive(info.pid)) return false;
    return true;
  } catch {
    // Unreadable or vanished lock file: treat as stale (it will be retried with O_EXCL anyway).
    return true;
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
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      if (await isStale(lockPath, staleMs)) {
        await fs.rm(lockPath, { force: true });
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
