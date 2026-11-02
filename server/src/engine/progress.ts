/** ASCII progress map of a subject (Phase 4 visualisation). Pure. */
import { levelLabel, type LabelLanguage } from '../core/labels.js';
import type { Subject, SubjectPath, Topic, TopicPath } from '../schema/index.js';
import { activeStage } from './recommender.js';

export function levelBar(level: Topic['level']): string {
  if (level === null) return '····';
  return '█'.repeat(level) + '░'.repeat(4 - level);
}

export interface ProgressInput {
  subject: string;
  subjectDoc: Subject | null;
  path: SubjectPath | null;
  topics: Topic[];
  topicPaths: TopicPath[];
  today: string;
  lang: LabelLanguage;
}

/**
 * Renders e.g.
 *   C++ — goal: …
 *   ████ 4  variables       Solid
 *   ███░ 3? pointers        Partial understanding (provisional) ▶ 3/5 Dereferencing ↻ ⚠ addr-vs-value
 *   ···· –  references      Not assessed · needs: pointers
 */
export function renderProgress(input: ProgressInput): string {
  const { lang } = input;
  const byId = new Map(input.topics.map((t) => [t.id, t]));
  const ordered = input.path ? input.path.topics.map((n) => n.id) : [];
  const others = input.topics.map((t) => t.id).filter((id) => !ordered.includes(id)).sort();
  const lines: string[] = [];
  const title = input.subjectDoc?.title ?? input.subject;
  const goal = input.path?.goal ?? input.subjectDoc?.goal;
  lines.push(`${title}${goal ? ` — ${goal}` : ''}`);
  const nameWidth = Math.min(28, Math.max(8, ...[...ordered, ...others].map((id) => id.split('/')[1]!.length)));

  const row = (id: string): string => {
    const t = byId.get(id);
    const slug = id.split('/')[1]!;
    const level = t?.level ?? null;
    const mark = level === null ? '–' : `${level}${t?.provisional ? '?' : ' '}`;
    const parts = [`${levelBar(level)} ${mark.padEnd(2)} ${slug.padEnd(nameWidth)} ${levelLabel(lang, level, { provisional: !!t?.provisional })}`];
    const plan = input.topicPaths.find((p) => p.topic === id);
    const st = plan ? activeStage(plan) : undefined;
    if (plan && st) parts.push(`▶ ${plan.stages.indexOf(st) + 1}/${plan.stages.length} ${st.title}`);
    if (t?.review && t.review.due <= input.today) parts.push('↻');
    const open = t?.misconceptions.filter((m) => m.status === 'open' || m.status === 'recurring') ?? [];
    if (open.length) parts.push(`⚠ ${open.map((m) => m.id).join(', ')}`);
    const node = input.path?.topics.find((n) => n.id === id);
    const missing = (node?.prerequisites ?? []).filter((p) => {
      const pt = byId.get(p);
      return !pt || pt.level === null || pt.level < 3;
    });
    if (missing.length && (level === null || level < 3)) parts.push(`· ${lang === 'ru' ? 'нужно' : 'needs'}: ${missing.map((m) => m.split('/')[1]).join(', ')}`);
    return parts.join(' ');
  };

  for (const id of ordered) lines.push(row(id));
  if (others.length) {
    lines.push(lang === 'ru' ? 'Вне плана:' : 'Outside the path:');
    for (const id of others) lines.push(row(id));
  }
  const counts = [4, 3, 2, 1].map((l) => input.topics.filter((t) => t.level === l).length);
  lines.push(
    lang === 'ru'
      ? `Итого: ${counts[0]} хорошо · ${counts[1]} частично · ${counts[2]} повторить · ${counts[3]} новое · ${input.topics.filter((t) => t.level === null).length} не оценено`
      : `Total: ${counts[0]} solid · ${counts[1]} partial · ${counts[2]} reinforce · ${counts[3]} new · ${input.topics.filter((t) => t.level === null).length} not assessed`,
  );
  lines.push(lang === 'ru' ? 'Легенда: ████ уровень 1–4 · ? предварительно · ▶ текущий этап · ↻ пора повторить · ⚠ заблуждение' : 'Legend: ████ level 1–4 · ? provisional · ▶ current stage · ↻ review due · ⚠ misconception');
  return lines.join('\n');
}
