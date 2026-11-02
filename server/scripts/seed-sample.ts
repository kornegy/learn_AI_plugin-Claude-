/**
 * Creates a realistic sample learner (C++ + SQL) in the given data root, using the real
 * services. Used to generate examples/sample-data and for manual walkthroughs.
 *
 *   node scripts/run-ts.mjs scripts/seed-sample.ts <root> [workspace] [--mode=sample|empty|corrupt|stale]
 *
 * Modes: sample (default) = full learner; empty = initialised, no subjects;
 * corrupt = sample with a broken knowledge-base/cpp/pointers.md (for doctor scenarios);
 * stale = sample plus a fast-moving web source last verified in early 2024.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fixedClock } from '../src/core/clock.js';
import { Mentor } from '../src/services/mentor.js';

const args = process.argv.slice(2);
const mode = (args.find((a) => a.startsWith('--mode='))?.slice(7) ?? 'sample') as 'sample' | 'empty' | 'corrupt' | 'stale';
const positional = args.filter((a) => !a.startsWith('--'));
const root = path.resolve(positional[0] ?? 'sample-data');
const workspace = positional[1] ? path.resolve(positional[1]) : undefined;
const clock = fixedClock('2026-10-01T09:00:00Z');
const m = new Mentor(root, clock);

await m.init({ ...(workspace ? { workspace_path: workspace } : {}), language: 'ru' });
if (mode === 'empty') {
  process.stdout.write(`Empty learner initialised in ${root}\n`);
  process.exit(0);
}
await m.updateProfile({
  target: 'profile',
  add: { goals: ['Стать junior-разработчиком системного ПО'], background: ['Год скриптов на Python'], strengths: ['Настойчивость'] },
});
await m.updateProfile({ target: 'preferences', add: { observed: ['Пространственные аналогии (дома, полки) заходят лучше абстрактных'] }, set: { pace: 'medium' } });

await m.planPath({
  subject: 'cpp',
  goal: 'Самостоятельно писать и отлаживать небольшие системные программы',
  create_missing: true,
  topics: [
    { topic_id: 'cpp/variables', title: 'Переменные' },
    { topic_id: 'cpp/memory-basics', title: 'Как устроена память', prerequisites: ['cpp/variables'] },
    { topic_id: 'cpp/pointers', title: 'Указатели', prerequisites: ['cpp/variables', 'cpp/memory-basics'] },
    { topic_id: 'cpp/references', title: 'Ссылки', prerequisites: ['cpp/pointers'] },
    { topic_id: 'cpp/dynamic-memory', title: 'Динамическая память', prerequisites: ['cpp/pointers'] },
  ],
});
await m.updateProfile({ target: 'subject:cpp', set: { title: 'C++' }, add: { aliases: ['c++', 'cpp', 'си плюс плюс'] } });
await m.upsertTopic({ topic_id: 'cpp/pointers', aliases: ['pointers', 'pointer'], sections: { summary: 'Указатель хранит адрес другого объекта в памяти; через `*p` можно читать и менять этот объект.' } });

// Variables: solid.
await m.recordEvidence({ topic_id: 'cpp/variables', events: [{ kind: 'explanation', outcome: 'success', note: 'объяснил тип, имя и значение' }, { kind: 'application', outcome: 'success' }] });
clock.advanceDays(2);
await m.recordEvidence({ topic_id: 'cpp/variables', events: [{ kind: 'application', outcome: 'success', context: 'review' }] });
await m.recordEvidence({ topic_id: 'cpp/memory-basics', events: [{ kind: 'explanation', outcome: 'success', note: 'стек и куча своими словами' }, { kind: 'recall', outcome: 'success' }] });

// Pointers: in progress with a misconception.
await m.planTopic({
  topic_id: 'cpp/pointers',
  goal: 'Использовать указатели для чтения и изменения значений, в том числе в функциях',
  stages: [
    { id: 'why-pointers', title: 'Зачем нужны указатели', goal: 'Объяснить две задачи, которые решают указатели', criteria: [{ kind: 'explanation' }] },
    { id: 'address-of', title: 'Оператор &', goal: 'Предсказать, что печатает &x и x', criteria: [{ kind: 'application' }] },
    { id: 'dereferencing', title: 'Разыменование', goal: 'Предсказать результат чтения и записи через *p', criteria: [{ kind: 'explanation' }, { kind: 'application' }] },
    { id: 'pointers-in-functions', title: 'Указатели в функциях', goal: 'Написать функцию, меняющую переменную вызывающего', criteria: [{ kind: 'application' }] },
    { id: 'practice', title: 'Практика без подсказок', goal: 'Решить задачу с указателями самостоятельно', criteria: [{ kind: 'application', independent: true }] },
  ],
});
clock.advanceDays(5);
await m.recordEvidence({ topic_id: 'cpp/pointers', events: [{ kind: 'explanation', outcome: 'success', note: 'зачем нужны указатели', quote: 'указатель — как записка с адресом квартиры' }] });
await m.updateStage({ topic_id: 'cpp/pointers', stage_id: 'why-pointers', status: 'done' });
await m.recordEvidence({ topic_id: 'cpp/pointers', events: [{ kind: 'application', outcome: 'success', hint_level: 1, note: 'предсказал вывод &x' }] });
await m.updateStage({ topic_id: 'cpp/pointers', stage_id: 'address-of', status: 'done' });
clock.advanceDays(3);
await m.recordEvidence({
  topic_id: 'cpp/pointers',
  events: [{ kind: 'application', outcome: 'fail', misconception: { id: 'addr-vs-value', description: 'Путает адрес переменной (&x) и значение по адресу (*p)' }, note: 'написал *p = &x' }],
});
await m.upsertTopic({ topic_id: 'cpp/pointers', sections: { understands: 'Зачем нужны указатели; что &x даёт адрес', gaps: 'Когда писать *p, а когда p' } });

// SQL: early.
await m.upsertTopic({ topic_id: 'sql/joins', title: 'Соединения таблиц (JOIN)', aliases: ['JOIN', 'joins'] });
await m.recordEvidence({ topic_id: 'sql/joins', events: [{ kind: 'self_report', outcome: 'success', reported_level: 3, note: 'говорит, что пользовался JOIN на курсах' }] });

await m.saveSource({
  subject: 'cpp',
  source_slug: 'cppreference-pointer',
  url: 'https://en.cppreference.com/w/cpp/language/pointer',
  title: 'Pointer declaration',
  publisher: 'cppreference.com',
  tier: 2,
  topics: ['cpp/pointers'],
  technology: 'C++',
  technology_version: 'C++23',
  volatility: 'stable',
  key_points: ['Указатель хранит адрес объекта или функции; тип указателя определяет, как интерпретируется объект по адресу.', 'Разыменование *p даёт lvalue объекта, на который указывает p.'],
});

if (mode === 'stale') {
  const staleClock = fixedClock('2024-03-01T09:00:00Z');
  const old = new Mentor(root, staleClock);
  await old.upsertTopic({ topic_id: 'web/react-use-effect', title: 'useEffect в React', aliases: ['useEffect', 'react effects'] });
  await old.saveSource({
    subject: 'web',
    source_slug: 'react-use-effect-legacy',
    url: 'https://legacy.reactjs.org/docs/hooks-effect.html',
    title: 'Using the Effect Hook',
    publisher: 'reactjs.org (legacy docs)',
    tier: 1,
    topics: ['web/react-use-effect'],
    technology: 'React',
    technology_version: '18.2',
    volatility: 'fast_moving',
    key_points: ['useEffect runs after render; the dependency array controls when it re-runs.', 'Return a cleanup function to undo subscriptions.'],
  });
}
if (mode === 'corrupt') {
  await fs.writeFile(path.join(root, 'knowledge-base/cpp/pointers.md'), '---\nschema: [broken\n---\nhalf-written file\n');
}
process.stdout.write(`Sample learner (${mode}) written to ${root}\n`);
