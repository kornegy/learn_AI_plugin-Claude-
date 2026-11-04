/** Topic matching for mentor_find_topics: tolerant to case, punctuation and word endings. Pure. */

export interface Searchable {
  id: string;
  title: string;
  aliases: string[];
}

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}+#]+/gu, ' ')
    .trim();
}

function tokens(s: string): string[] {
  return normalizeText(s).split(' ').filter(Boolean);
}

/** Two tokens match if equal, or share a long common prefix (handles "pointer"/"pointers", "указатели"/"указателей"). */
function tokenMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const min = Math.min(a.length, b.length);
  if (min < 4) return false;
  let i = 0;
  while (i < min && a[i] === b[i]) i++;
  return i >= Math.max(4, min - 2);
}

export function scoreMatch(query: string, item: Searchable): number {
  const q = normalizeText(query);
  if (!q) return 0;
  const slug = item.id.split('/').pop() ?? item.id;
  const names = [item.title, ...item.aliases, slug.replace(/-/g, ' '), item.id];
  let best = 0;
  const qTokens = tokens(query);
  for (const name of names) {
    const n = normalizeText(name);
    if (!n) continue;
    if (n === q) return 1;
    if (n.includes(q) || q.includes(n)) best = Math.max(best, 0.8);
    const nTokens = tokens(name);
    if (!qTokens.length || !nTokens.length) continue;
    const matched = qTokens.filter((t) => nTokens.some((u) => tokenMatch(t, u))).length;
    const score = (0.7 * matched) / Math.max(qTokens.length, nTokens.length);
    best = Math.max(best, score);
  }
  return Math.round(best * 100) / 100;
}

export function searchTopics<T extends Searchable>(query: string, items: T[], limit = 10, minScore = 0.3): (T & { score: number })[] {
  return items
    .map((it) => ({ ...it, score: scoreMatch(query, it) }))
    .filter((it) => it.score >= minScore)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}
