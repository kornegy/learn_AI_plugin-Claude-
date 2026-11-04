/**
 * Secret filter (ARCHITECTURE §12.1). Learning notes must never contain credentials.
 * Returns the name of the first matching pattern, never the matched value.
 */
const PATTERNS: [string, RegExp][] = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['AWS access key', /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ['API key (sk-…)', /\bsk-(ant-|proj-)?[A-Za-z0-9_-]{20,}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/],
  ['password assignment', /\b(pass(word)?|passwd|pwd|secret|api[_-]?key|token)\s*[:=]\s*["']?[^\s"']{6,}/i],
  ['connection string with credentials', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i],
];

function entropy(s: string): number {
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

export function findSecret(text: string): string | null {
  if (!text) return null;
  for (const [name, re] of PATTERNS) if (re.test(text)) return name;
  // Long random-looking tokens (hex/base64) are likely credentials.
  for (const token of text.match(/[A-Za-z0-9+/_=-]{40,}/g) ?? []) {
    const hasDigit = /\d/.test(token);
    const hasLetter = /[A-Za-z]/.test(token);
    if (hasDigit && hasLetter && entropy(token) > 4.2) return 'high-entropy token';
  }
  return null;
}
