import { randomBytes } from 'node:crypto';
import { MentorError } from './errors.js';

/** English kebab-case slug used for subjects, topic slugs, stages, misconceptions and sources. */
export const SLUG_PATTERN = '^[a-z0-9][a-z0-9-]{0,47}$';
const SLUG_RE = new RegExp(SLUG_PATTERN);

const WINDOWS_RESERVED = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

/** Names the server uses for its own files inside subject folders. */
const RESERVED_SLUGS = new Set(['_path']);

export function isSlug(value: string): boolean {
  return SLUG_RE.test(value) && !value.endsWith('-') && !value.includes('--') && !WINDOWS_RESERVED.has(value) && !RESERVED_SLUGS.has(value);
}

export function assertSlug(kind: string, value: string): string {
  if (!isSlug(value)) {
    throw new MentorError(
      'E_INVALID_INPUT',
      `Invalid ${kind} id "${value}". Use English kebab-case: lowercase letters, digits and single hyphens, 1-48 chars (e.g. "memory-basics").`,
    );
  }
  return value;
}

export interface QualifiedId {
  subject: string;
  slug: string;
}

/** Parses "<subject>/<slug>" ids used for topics and sources. */
export function parseQualifiedId(kind: string, id: string): QualifiedId {
  const parts = id.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new MentorError('E_INVALID_INPUT', `Invalid ${kind} id "${id}". Expected "<subject>/<slug>", e.g. "cpp/pointers".`);
  }
  return { subject: assertSlug('subject', parts[0]), slug: assertSlug(kind, parts[1]) };
}

export function qualifiedId(subject: string, slug: string): string {
  return `${subject}/${slug}`;
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Time-sortable unique id (ULID layout: 48-bit ms timestamp + 80 random bits). */
export function ulid(now: Date = new Date()): string {
  let time = now.getTime();
  let timePart = '';
  for (let i = 0; i < 10; i++) {
    timePart = CROCKFORD[time % 32] + timePart;
    time = Math.floor(time / 32);
  }
  const bytes = randomBytes(16);
  let randPart = '';
  for (let i = 0; i < 16; i++) randPart += CROCKFORD[bytes[i]! % 32];
  return timePart + randPart;
}

export function randomToken(length = 8): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}
