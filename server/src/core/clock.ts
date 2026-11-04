/** Injectable time source so that engines and services are testable. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(iso: string): Clock & { set(iso: string): void; advanceDays(n: number): void } {
  let current = new Date(iso);
  return {
    now: () => new Date(current.getTime()),
    set(next: string) {
      current = new Date(next);
    },
    advanceDays(n: number) {
      current = new Date(current.getTime() + n * 86_400_000);
    },
  };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Local calendar date, YYYY-MM-DD. */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO 8601 local timestamp with UTC offset, second precision. */
export function isoWithOffset(d: Date): string {
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return (
    `${localDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** Local time HH:MM. */
export function localTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Whole days from day a to day b (b - a), both YYYY-MM-DD. */
export function dayDiff(a: string, b: string): number {
  const ta = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const tb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((tb - ta) / 86_400_000);
}

export function addDays(day: string, n: number): string {
  const t = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) + n * 86_400_000;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Noon UTC of a calendar day: a stable instant for day-granular scheduling. */
export function dayToInstant(day: string): Date {
  return new Date(`${day}T12:00:00.000Z`);
}

/** Calendar day of an instant produced by dayToInstant or by the scheduler (UTC-based). */
export function instantToDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
