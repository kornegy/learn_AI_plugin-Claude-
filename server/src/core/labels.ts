/** Localised labels used in files and in the learner card. v1 ships ru and en. */
export type LabelLanguage = 'en' | 'ru';

export type Level = 1 | 2 | 3 | 4;

const LEVELS: Record<LabelLanguage, Record<'null' | Level, string>> = {
  en: { null: 'Not assessed', 1: 'New to me', 2: 'Needs reinforcement', 3: 'Partial understanding', 4: 'Solid' },
  ru: {
    null: 'Не оценено',
    1: 'Не знаю совсем',
    2: 'Стоит повторить / закрепить',
    3: 'Есть понимание, но слабое',
    4: 'Хорошо знаю',
  },
};

const FLAGS: Record<LabelLanguage, { provisional: string; manual: string }> = {
  en: { provisional: 'provisional', manual: 'set manually' },
  ru: { provisional: 'предварительно', manual: 'задано вручную' },
};

export function levelLabel(lang: LabelLanguage, level: Level | null, opts: { provisional?: boolean; manual?: boolean } = {}): string {
  const base = LEVELS[lang][level ?? 'null'];
  const flags: string[] = [];
  if (opts.provisional && level !== null) flags.push(FLAGS[lang].provisional);
  if (opts.manual) flags.push(FLAGS[lang].manual);
  return flags.length ? `${base} (${flags.join(', ')})` : base;
}

export type SectionName =
  | 'status'
  | 'summary'
  | 'studied'
  | 'understands'
  | 'gaps'
  | 'errors'
  | 'evidence'
  | 'to_review'
  | 'notes'
  | 'levels'
  | 'overview'
  | 'key_points'
  | 'quotes';

const HEADINGS: Record<LabelLanguage, Record<SectionName, string>> = {
  en: {
    status: 'Status',
    summary: 'Summary',
    studied: 'What has been studied',
    understands: 'What the learner understands',
    gaps: 'Not understood yet',
    errors: 'Mistakes',
    evidence: 'Evidence of understanding',
    to_review: 'To review',
    notes: 'Notes',
    levels: 'Topic levels',
    overview: 'Overview',
    key_points: 'Key points',
    quotes: 'Short quotes',
  },
  ru: {
    status: 'Статус',
    summary: 'Кратко',
    studied: 'Что уже изучено',
    understands: 'Что понимает',
    gaps: 'Что пока не понимает',
    errors: 'Допущенные ошибки',
    evidence: 'Доказательства понимания',
    to_review: 'Что повторить',
    notes: 'Заметки',
    levels: 'Уровни по темам',
    overview: 'Обзор',
    key_points: 'Главное',
    quotes: 'Короткие цитаты',
  },
};

export function heading(lang: LabelLanguage, name: string): string {
  return (HEADINGS[lang] as Record<string, string>)[name] ?? name;
}

/** Maps a BCP-47 tag (or "auto") to a label language. */
export function toLabelLanguage(tag: string | undefined | null): LabelLanguage {
  if (!tag) return 'en';
  return tag.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}
