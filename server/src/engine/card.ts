/**
 * The learner card (ARCHITECTURE §8): a compact list of FACTS about the learner, injected at
 * session start. No imperative instructions here — those live in the skills. Pure.
 */
import { dayDiff, localDay, localTime } from '../core/clock.js';
import { levelLabel, type LabelLanguage } from '../core/labels.js';
import type { Config, Preferences, Profile, Subject, SubjectPath, Topic, TopicPath } from '../schema/index.js';
import { activeStage, dueReviews } from './recommender.js';

export const CARD_BUDGET = 4000;

export interface CardInput {
  now: Date;
  workspace: string | null;
  config: Config;
  profile: Profile | null;
  preferences: Preferences | null;
  subjects: Subject[];
  topics: Topic[];
  subjectPaths: SubjectPath[];
  topicPaths: TopicPath[];
  lastSession: { day: string; notes: string[] } | null;
  problems: string[];
  subject?: string;
}

/** Learner-provided text is data: single line, bounded, quoted. */
export function quote(s: string, max = 120): string {
  const one = s.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  const cut = one.length > max ? `${one.slice(0, max - 1)}…` : one;
  return `"${cut.replace(/"/g, "'")}"`;
}

export function buildCard(input: CardInput, budget = CARD_BUDGET): string {
  const { config, now } = input;
  const lang: LabelLanguage = config.label_language;
  const today = localDay(now);
  const inScope = (id: string) => !input.subject || id.startsWith(`${input.subject}/`);
  const topics = input.topics.filter((t) => inScope(t.id));
  const lines: string[] = [];
  const add = (line: string) => lines.push(line);

  add(`Learning Mentor — learner card (data as of ${today}, local time ${localTime(now)})`);
  if (input.workspace) {
    add(
      `Learning workspace: active (${input.workspace}). The learner set this folder up for learning: requests here, including requests ` +
        'for code, are learning exercises, and the rules the learner chose for replies are in the skills learning-mentor:mentor and ' +
        'learning-mentor:code-mentor (small steps, guidance instead of finished solutions, normal mode only when the learner opts out).',
    );
  }
  add(
    `Settings: language=${config.language}, style=${config.explanation_style}, strictness=${config.assessment_strictness}, ` +
      `assistance=${config.assistance_level}, mode=${config.learning_mode}, reviews=${config.review_intensity}`,
  );
  for (const p of input.problems.slice(0, 3)) add(`Data problem: ${p}`);

  const active = input.subjects.filter((s) => s.status === 'active' && (!input.subject || s.id === input.subject));
  if (active.length) {
    add(`Active subjects: ${active.map((s) => `${s.id}${s.goal ? ` (goal: ${quote(s.goal, 80)})` : ''}`).join(', ')}`);
  } else if (!topics.length) {
    add('Active subjects: none yet (new learner).');
  }

  const current = input.topicPaths
    .filter((p) => inScope(p.topic))
    .map((p) => ({ p, st: activeStage(p) }))
    .filter((x) => x.st)
    .sort((a, b) => (a.p.updated < b.p.updated ? 1 : -1));
  for (const { p, st } of current.slice(0, 3)) {
    const idx = p.stages.findIndex((s) => s.id === st!.id) + 1;
    add(`Current: ${p.topic} — stage ${idx}/${p.stages.length} ${quote(st!.title, 60)} (active since ${st!.started ?? 'unknown'})`);
  }

  const due = dueReviews(topics, today);
  if (due.length) {
    const shown = due.slice(0, 5).map(({ topic, overdueDays }) => `${topic.id} (${overdueDays > 0 ? `overdue ${overdueDays} d` : 'due today'})`);
    add(`Due reviews: ${shown.join(', ')}${due.length > 5 ? ` … (+${due.length - 5} more; use mentor_next)` : ''}`);
  }

  const misc = new Map<string, { desc: string; topics: string[]; n: number; status: string }>();
  for (const t of topics) {
    for (const m of t.misconceptions) {
      if (m.status !== 'open' && m.status !== 'recurring') continue;
      const cur = misc.get(m.id) ?? { desc: m.description, topics: [], n: 0, status: m.status };
      cur.topics.push(t.id);
      cur.n += m.occurrences;
      misc.set(m.id, cur);
    }
  }
  if (misc.size) {
    const items = [...misc.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 4);
    add(`Open misconceptions: ${items.map(([id, v]) => `${id} ${quote(v.desc, 70)} (${v.topics.join(', ')}; seen ${v.n}×)`).join('; ')}`);
  }

  const assessed = topics
    .filter((t) => t.level !== null)
    .sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : a.id.localeCompare(b.id)));
  if (assessed.length) {
    const shown = assessed
      .slice(0, 8)
      .map((t) => `${t.id} ${t.level} ${levelLabel(lang, t.level, { provisional: t.provisional, manual: t.level_source === 'override' })}`);
    add(`Recent levels: ${shown.join(' · ')}${assessed.length > 8 ? ` … (+${assessed.length - 8} more)` : ''}`);
  }
  const notAssessed = topics.filter((t) => t.level === null).length;
  if (notAssessed) add(`Topics planned but not assessed yet: ${notAssessed}`);

  if (input.lastSession) {
    const gap = dayDiff(input.lastSession.day, today);
    const notes = input.lastSession.notes.slice(0, 2).map((n) => quote(n, 90)).join('; ');
    add(`Last learning activity: ${input.lastSession.day} (${gap} day(s) ago)${notes ? ` — ${notes}` : ''}`);
  }

  const prefs: string[] = [];
  for (const o of input.preferences?.observed.slice(-3) ?? []) prefs.push(quote(o.note, 90));
  if (input.preferences?.pace) prefs.push(`pace ${input.preferences.pace}`);
  if (prefs.length) add(`Observed preferences: ${prefs.join('; ')}`);
  if (input.profile?.goals.length) add(`Goals: ${input.profile.goals.slice(0, 3).map((g) => quote(g, 80)).join('; ')}`);

  add('Details and progress recording are available through the mentor_* tools.');

  // Enforce the budget: drop lines from the end (keeping the first and last line) until it fits.
  const tail = lines.pop()!;
  let text = [...lines, tail].join('\n');
  while (text.length > budget && lines.length > 1) {
    lines.splice(lines.length - 1, 1);
    text = [...lines, '… (card truncated; use mentor_get_context)', tail].join('\n');
  }
  return text.length > budget ? text.slice(0, budget - 1) + '…' : text;
}
