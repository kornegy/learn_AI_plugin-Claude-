/** Append-only event journal: .mentor/journal/YYYY-MM.jsonl (DATA_FORMAT §10). */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { JournalEventSchema, type JournalEvent } from '../schema/index.js';
import { appendDurable, atomicWrite, listFiles } from './fsx.js';
import { MentorError } from '../core/errors.js';

export const MAX_LINE_BYTES = 16 * 1024;
/** A monthly journal file above this size is not loaded (it cannot be legitimate: ~100k events). */
export const MAX_JOURNAL_FILE_BYTES = 64 * 1024 * 1024;

export interface JournalRead {
  events: JournalEvent[];
  badLines: { file: string; line: number }[];
  oversized: string[];
}

export class Journal {
  constructor(private readonly dir: string) {}

  async append(events: JournalEvent[]): Promise<void> {
    if (!events.length) return;
    const byFile = new Map<string, string[]>();
    for (const ev of events) {
      const line = JSON.stringify(ev);
      if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) {
        throw new MentorError('E_INVALID_INPUT', `Journal event "${ev.type}" is too large (max ${MAX_LINE_BYTES / 1024} KB).`);
      }
      const file = `${ev.day.slice(0, 7)}.jsonl`;
      const list = byFile.get(file) ?? [];
      list.push(line);
      byFile.set(file, list);
    }
    for (const [file, lines] of byFile) await appendDurable(path.join(this.dir, file), lines.join('\n') + '\n');
  }

  async readAll(): Promise<JournalRead> {
    const events: JournalEvent[] = [];
    const badLines: JournalRead['badLines'] = [];
    const oversized: string[] = [];
    for (const file of await listFiles(this.dir, '.jsonl')) {
      const p = path.join(this.dir, file);
      if ((await fs.stat(p)).size > MAX_JOURNAL_FILE_BYTES) {
        oversized.push(file);
        continue;
      }
      const text = await fs.readFile(p, 'utf8');
      const lines = text.split('\n');
      lines.forEach((line, idx) => {
        if (!line.trim()) return;
        try {
          const parsed = JournalEventSchema.safeParse(JSON.parse(line));
          if (parsed.success) events.push(parsed.data);
          else badLines.push({ file, line: idx + 1 });
        } catch {
          badLines.push({ file, line: idx + 1 });
        }
      });
    }
    // Files are monthly and ids are time-sortable; sort for a stable chronological order.
    events.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { events, badLines, oversized };
  }

  /** Removes events matching the predicate (used only by purge). Returns the number removed. */
  async remove(predicate: (ev: JournalEvent) => boolean): Promise<number> {
    let removed = 0;
    for (const file of await listFiles(this.dir, '.jsonl')) {
      const p = path.join(this.dir, file);
      const lines = (await fs.readFile(p, 'utf8')).split('\n');
      const kept: string[] = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JournalEventSchema.safeParse(JSON.parse(line));
          if (parsed.success && predicate(parsed.data)) {
            removed++;
            continue;
          }
        } catch {
          /* keep unparseable lines as they are; doctor reports them */
        }
        kept.push(line);
      }
      await atomicWrite(p, kept.length ? kept.join('\n') + '\n' : '');
    }
    return removed;
  }
}
