/**
 * Markdown documents: YAML frontmatter + body made of free text and managed sections
 * (docs/DATA_FORMAT.md §4). Parsing and serialising is lossless for text outside sections.
 */
import YAML from 'yaml';
import { MentorError } from '../core/errors.js';

export const SECTION_LIMIT = 8000;

export interface Section {
  type: 'section';
  name: string;
  heading: string;
  content: string; // without the heading line, trimmed of surrounding blank lines
}
export interface FreeText {
  type: 'text';
  text: string;
}
export type Segment = Section | FreeText;

export interface MarkdownDoc {
  frontmatter: unknown;
  segments: Segment[];
}

const OPEN_RE = /^<!-- mentor:section ([a-z0-9_.-]+) -->$/;
const END = '<!-- mentor:end -->';

export function parseDoc(text: string, label = 'document'): MarkdownDoc {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    throw new MentorError('E_CORRUPT', `${label}: missing YAML frontmatter.`, { path: label });
  }
  const end = normalized.indexOf('\n---\n', 4);
  const endAtEof = normalized.endsWith('\n---') ? normalized.length - 4 : -1;
  const fmEnd = end !== -1 ? end : endAtEof;
  if (fmEnd === -1) throw new MentorError('E_CORRUPT', `${label}: frontmatter is not closed with "---".`, { path: label });
  // Include the newline before the closing '---': it belongs to the last YAML value (matters for '|+').
  const fmText = normalized.slice(4, fmEnd + 1);
  let frontmatter: unknown;
  try {
    frontmatter = YAML.parse(fmText, { schema: 'core', uniqueKeys: true, logLevel: 'error' }) ?? {};
  } catch (e) {
    throw new MentorError('E_CORRUPT', `${label}: frontmatter is not valid YAML (${(e as Error).message.split('\n')[0]}).`, { path: label });
  }
  const body = end !== -1 ? normalized.slice(end + 5) : '';
  return { frontmatter, segments: parseBody(body, label) };
}

function parseBody(body: string, label: string): Segment[] {
  const lines = body.split('\n');
  const segments: Segment[] = [];
  let text: string[] = [];
  const flushText = () => {
    if (text.length) segments.push({ type: 'text', text: text.join('\n') });
    text = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = OPEN_RE.exec(line.trim());
    if (!m) {
      if (line.trim() === END) throw new MentorError('E_CORRUPT', `${label}: "${END}" without a matching section start.`, { path: label });
      text.push(line);
      continue;
    }
    flushText();
    const name = m[1]!;
    const inner: string[] = [];
    let closed = false;
    for (i = i + 1; i < lines.length; i++) {
      const l = lines[i]!;
      if (l.trim() === END) {
        closed = true;
        break;
      }
      if (OPEN_RE.test(l.trim())) break;
      inner.push(l);
    }
    if (!closed) throw new MentorError('E_CORRUPT', `${label}: section "${name}" is not closed with "${END}".`, { path: label });
    while (inner.length && inner[0]!.trim() === '') inner.shift();
    let heading = '';
    if (inner.length && inner[0]!.startsWith('## ')) heading = inner.shift()!.slice(3).trim();
    segments.push({ type: 'section', name, heading, content: trimBlank(inner.join('\n')) });
  }
  flushText();
  return segments;
}

function trimBlank(s: string): string {
  return s.replace(/^\s*\n/, '').replace(/\n\s*$/, '').replace(/^\n+|\n+$/g, '');
}

export function serializeDoc(doc: MarkdownDoc): string {
  // Remove only the final newline: trimming more would change values that end in newlines (YAML "|+").
  const raw = YAML.stringify(doc.frontmatter, { lineWidth: 0, indent: 2, blockQuote: false });
  const fm = raw.endsWith('\n') ? raw.slice(0, -1) : raw;
  const parts: string[] = [];
  for (const seg of doc.segments) {
    if (seg.type === 'text') {
      parts.push(seg.text);
      continue;
    }
    const block = [`<!-- mentor:section ${seg.name} -->`, `## ${seg.heading}`];
    if (seg.content) block.push(seg.content);
    block.push(END);
    parts.push(block.join('\n'));
  }
  let body = parts.join('\n');
  body = body.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
  return `---\n${fm}\n---\n\n${body.trimEnd()}\n`;
}

/**
 * Learner or model text must never contain our structural markers: neutralise any
 * "<!-- mentor:" sequence so section boundaries can only come from the server.
 */
export function neutralizeMarkers(text: string): string {
  // Also normalise line endings: the parser reads CRLF/CR as LF, so storing them would make
  // the file change on every rewrite.
  return text.replace(/\r\n?/g, '\n').replace(/<!--(\s*)mentor:/gi, '<!--$1mentor-text:');
}

export function getSection(doc: MarkdownDoc, name: string): Section | undefined {
  return doc.segments.find((s): s is Section => s.type === 'section' && s.name === name);
}

/** Replaces (or creates at the end) a section's content. The learner's heading edits are kept. */
export function setSection(doc: MarkdownDoc, name: string, heading: string, content: string): void {
  const safe = neutralizeMarkers(content).trim();
  const existing = getSection(doc, name);
  if (existing) {
    existing.content = safe;
    if (!existing.heading) existing.heading = heading;
    return;
  }
  doc.segments.push({ type: 'text', text: '' }, { type: 'section', name, heading, content: safe });
}

/**
 * Appends bullet lines. If the section grows beyond the limit, the oldest bullets move to an
 * "<name>-archive" section at the end of the document, so nothing is lost.
 */
export function appendToSection(doc: MarkdownDoc, name: string, heading: string, lines: string[], archiveHeading: string): void {
  const clean = lines
    .flatMap((l) => neutralizeMarkers(l).split('\n'))
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith('- ') ? l : `- ${l}`));
  if (!clean.length) return;
  const existing = getSection(doc, name);
  const current = existing?.content ? existing.content.split('\n') : [];
  let all = [...current, ...clean];
  const moved: string[] = [];
  while (all.join('\n').length > SECTION_LIMIT && all.length > 1) moved.push(all.shift()!);
  setSection(doc, name, heading, all.join('\n'));
  if (moved.length) {
    const archName = `${name}-archive`;
    const arch = getSection(doc, archName);
    const archLines = arch?.content ? arch.content.split('\n') : [];
    setSection(doc, archName, archiveHeading, [...archLines, ...moved].join('\n'));
  }
}

export function newDoc(frontmatter: unknown): MarkdownDoc {
  return { frontmatter, segments: [] };
}
