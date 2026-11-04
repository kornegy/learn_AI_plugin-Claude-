/** Cheap read of the newest journal event's id (unique, unlike second-precision timestamps), for the nudge hook. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DIRS } from './root.js';

export async function latestJournalEventId(root: string): Promise<string | null> {
  const dir = path.join(root, DIRS.journal);
  let files: string[];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith('.jsonl')).sort();
  } catch {
    return null;
  }
  for (const file of files.reverse()) {
    const handle = await fs.open(path.join(dir, file), 'r');
    try {
      const { size } = await handle.stat();
      const len = Math.min(size, 32 * 1024);
      const buf = Buffer.alloc(len);
      await handle.read(buf, 0, len, size - len);
      const lines = buf.toString('utf8').split('\n').filter((l) => l.trim());
      for (const line of lines.reverse()) {
        try {
          const id = (JSON.parse(line) as { id?: unknown }).id;
          if (typeof id === 'string') return id;
        } catch {
          /* partial first line of the tail window, or a corrupt line */
        }
      }
    } finally {
      await handle.close();
    }
  }
  return null;
}
