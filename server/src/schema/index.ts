/**
 * Zod schemas for every on-disk file kind (docs/DATA_FORMAT.md, schema 1).
 * Object schemas are "loose": unknown keys written by a newer plugin are preserved.
 */
import { z } from 'zod';
import { SLUG_PATTERN } from '../core/ids.js';

export const DATA_SCHEMA = 1;

const slugRe = new RegExp(SLUG_PATTERN);
export const Slug = z.string().regex(slugRe, 'English kebab-case id, e.g. "memory-basics"');
export const QualifiedId = z
  .string()
  .regex(new RegExp(`${SLUG_PATTERN.slice(0, -1)}/${SLUG_PATTERN.slice(1)}`), '"<subject>/<slug>", e.g. "cpp/pointers"');
export const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
export const Timestamp = z.string().min(10);

export const LevelValue = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export const NullableLevel = LevelValue.nullable();

export const EvidenceKind = z.enum(['exposure', 'self_report', 'recognition', 'recall', 'explanation', 'application', 'transfer']);
export const Outcome = z.enum(['success', 'partial', 'fail']);
export const Independence = z.enum(['independent', 'assisted']);
export const EvidenceContext = z.enum(['learning', 'review', 'diagnostic']);
export const Strictness = z.enum(['lenient', 'standard', 'strict']);
export const MisconceptionStatus = z.enum(['open', 'resolving', 'resolved', 'recurring']);
export const StageStatus = z.enum(['pending', 'active', 'done', 'skipped']);
export const Volatility = z.enum(['fast_moving', 'stable', 'foundational']);

const schemaVersion = z.number().int().positive();

// ---------------------------------------------------------------- config / meta

export const ConfigSchema = z.looseObject({
  schema: schemaVersion.default(DATA_SCHEMA),
  language: z.string().min(2).max(35).default('auto'),
  label_language: z.enum(['en', 'ru']).default('en'),
  explanation_style: z.enum(['analogy-first', 'example-first', 'concept-first']).default('analogy-first'),
  assessment_strictness: Strictness.default('standard'),
  review_intensity: z.enum(['light', 'normal', 'intensive']).default('normal'),
  assistance_level: z.enum(['supportive', 'balanced', 'strict']).default('balanced'),
  learning_mode: z.enum(['guided', 'socratic', 'practice', 'exam']).default('guided'),
  research: z
    .looseObject({
      auto: z.boolean().default(true),
      ttl_days: z
        .looseObject({
          fast_moving: z.number().int().positive().default(90),
          stable: z.number().int().positive().default(365),
          foundational: z.number().int().positive().default(1095),
        })
        .default({ fast_moving: 90, stable: 365, foundational: 1095 }),
    })
    .default({ auto: true, ttl_days: { fast_moving: 90, stable: 365, foundational: 1095 } }),
  workspaces: z.array(z.string().min(1)).default([]),
});
export type Config = z.infer<typeof ConfigSchema>;

export const MetaSchema = z.looseObject({
  data_schema: schemaVersion,
  created: Timestamp,
  plugin_version_last_write: z.string(),
});
export type Meta = z.infer<typeof MetaSchema>;

// ---------------------------------------------------------------- learner profile

const shortText = z.string().min(1).max(300);
const textList = z.array(shortText).max(50);

export const ProfileSchema = z.looseObject({
  schema: schemaVersion,
  kind: z.literal('profile'),
  created: Day,
  updated: Day,
  display_name: z.string().max(80).nullable().default(null),
  background: textList.default([]),
  goals: textList.default([]),
  strengths: textList.default([]),
  weaknesses: textList.default([]),
  recommendations: textList.default([]),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const PreferencesSchema = z.looseObject({
  schema: schemaVersion,
  kind: z.literal('preferences'),
  updated: Day,
  observed: z.array(z.looseObject({ day: Day, note: shortText })).max(100).default([]),
  pace: z.enum(['slow', 'medium', 'fast']).nullable().default(null),
  explanation_depth: z.enum(['brief', 'standard', 'deep']).nullable().default(null),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

export const SubjectSchema = z.looseObject({
  schema: schemaVersion,
  kind: z.literal('subject'),
  id: Slug,
  title: z.string().min(1).max(120),
  aliases: z.array(z.string().min(1).max(80)).max(20).default([]),
  started: Day,
  updated: Day,
  goal: z.string().max(300).nullable().default(null),
  status: z.enum(['active', 'paused', 'completed']).default('active'),
  strengths: textList.default([]),
  weaknesses: textList.default([]),
  recurring_errors: z.array(Slug).max(50).default([]),
});
export type Subject = z.infer<typeof SubjectSchema>;

// ---------------------------------------------------------------- topic

export const MisconceptionSchema = z.looseObject({
  id: Slug,
  description: z.string().max(300),
  status: MisconceptionStatus,
  first_seen: Day,
  last_seen: Day,
  occurrences: z.number().int().nonnegative(),
});
export type Misconception = z.infer<typeof MisconceptionSchema>;

export const ReviewSchema = z.looseObject({
  due: Day,
  stability: z.number(),
  difficulty: z.number(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  state: z.enum(['new', 'learning', 'review', 'relearning']),
  last_review: Day.nullable(),
});
export type Review = z.infer<typeof ReviewSchema>;

export const TopicSchema = z.looseObject({
  schema: schemaVersion,
  kind: z.literal('topic'),
  id: QualifiedId,
  subject: Slug,
  title: z.string().min(1).max(120),
  aliases: z.array(z.string().min(1).max(80)).max(20).default([]),
  created: Day,
  updated: Day,
  prerequisites: z.array(QualifiedId).max(30).default([]),
  level: NullableLevel.default(null),
  provisional: z.boolean().default(false),
  level_source: z.enum(['evidence', 'self_report', 'override', 'none']).default('none'),
  regressed_on: Day.nullable().default(null),
  last_assessed: Day.nullable().default(null),
  evidence_counts: z.record(z.string(), z.number().int().nonnegative()).default({}),
  misconceptions: z.array(MisconceptionSchema).default([]),
  review: ReviewSchema.nullable().default(null),
});
export type Topic = z.infer<typeof TopicSchema>;

// ---------------------------------------------------------------- paths

export const CriterionSchema = z.looseObject({
  kind: z.enum(['recall', 'explanation', 'application', 'transfer']),
  min: z.number().int().min(1).max(10).default(1),
  independent: z.boolean().default(false),
});
export type Criterion = z.infer<typeof CriterionSchema>;

export const StageSchema = z.looseObject({
  id: Slug,
  title: z.string().min(1).max(120),
  goal: z.string().min(1).max(300),
  criteria: z.array(CriterionSchema).min(1).max(5),
  status: StageStatus.default('pending'),
  started: Day.nullable().default(null),
  completed: Day.nullable().default(null),
  skip_reason: z.string().max(300).nullable().default(null),
  override_reason: z.string().max(300).nullable().default(null),
});
export type Stage = z.infer<typeof StageSchema>;

export const TopicPathSchema = z.looseObject({
  schema: schemaVersion,
  kind: z.literal('topic_path'),
  topic: QualifiedId,
  goal: z.string().min(1).max(300),
  created: Day,
  updated: Day,
  next_topics: z.array(QualifiedId).max(20).default([]),
  stages: z.array(StageSchema).min(1).max(20),
});
export type TopicPath = z.infer<typeof TopicPathSchema>;

export const PathTopicSchema = z.looseObject({ id: QualifiedId, prerequisites: z.array(QualifiedId).max(30).default([]) });

export const SubjectPathSchema = z.looseObject({
  schema: schemaVersion,
  kind: z.literal('subject_path'),
  subject: Slug,
  goal: z.string().min(1).max(300),
  created: Day,
  updated: Day,
  topics: z.array(PathTopicSchema).max(200),
});
export type SubjectPath = z.infer<typeof SubjectPathSchema>;

// ---------------------------------------------------------------- research source

export const SourceSchema = z.looseObject({
  schema: schemaVersion,
  kind: z.literal('source'),
  id: QualifiedId,
  subject: Slug,
  topics: z.array(QualifiedId).max(20).default([]),
  url: z.string().url().max(2048),
  title: z.string().min(1).max(200),
  publisher: z.string().min(1).max(120),
  tier: z.number().int().min(1).max(5),
  technology: z.string().max(80).nullable().default(null),
  technology_version: z.string().max(40).nullable().default(null),
  published: Day.nullable().default(null),
  accessed_at: Day,
  verified_at: Day,
  volatility: Volatility,
  conflicts: z.array(z.string().min(1).max(300)).max(10).default([]),
});
export type Source = z.infer<typeof SourceSchema>;

// ---------------------------------------------------------------- journal

export const EvidenceDataSchema = z.object({
  kind: EvidenceKind,
  outcome: Outcome,
  independence: Independence.default('independent'),
  hint_level: z.number().int().min(0).max(5).default(0),
  context: EvidenceContext.default('learning'),
  misconception: z.object({ id: Slug, description: z.string().max(300) }).nullable().default(null),
  addresses: z.array(Slug).max(10).default([]),
  reported_level: LevelValue.nullable().default(null),
  note: z.string().max(300).default(''),
  quote: z.string().max(300).default(''),
});
export type EvidenceData = z.infer<typeof EvidenceDataSchema>;

export const JournalEventSchema = z.looseObject({
  v: z.literal(1),
  id: z.string().min(10),
  ts: Timestamp,
  day: Day,
  type: z.string().min(1),
  subject: z.string().optional(),
  topic: z.string().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
});
export type JournalEvent = z.infer<typeof JournalEventSchema>;

/** Every frontmatter schema keyed by `kind`, for generic validation (doctor). */
export const SCHEMAS_BY_KIND = {
  profile: ProfileSchema,
  preferences: PreferencesSchema,
  subject: SubjectSchema,
  topic: TopicSchema,
  topic_path: TopicPathSchema,
  subject_path: SubjectPathSchema,
  source: SourceSchema,
} as const;
export type DocKind = keyof typeof SCHEMAS_BY_KIND;

/** Formats a zod error into one readable line per issue. */
export function formatZodError(err: z.ZodError): string {
  return err.issues
    .slice(0, 8)
    .map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`)
    .join('; ');
}
