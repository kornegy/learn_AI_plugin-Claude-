# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/). The on-disk data format has its own version
(`data_schema`, see [docs/DATA_FORMAT.md](docs/DATA_FORMAT.md)).

## [Unreleased]

## [0.9.0] - 2026-11-02

Release candidate after Phase 5 (QA). Data schema unchanged (1). See docs/QA_REPORT.md.

### Security

- Section markers inside learner or model text are neutralised, so the text can no longer end a
  managed section early and make a file unreadable.
- Stale lock takeover is race-safe (atomic rename plus content check).
- Only kebab-case file and folder names are read; other names are ignored and never echoed into
  the learner card.
- The secret filter also covers topic titles in `mentor_plan_path` and topic aliases.
- The filesystem root and the home folder can't be learning workspaces or the data root.
- Journal files over 64 MB are skipped and reported instead of loaded.

### Fixed

- Round-trip bugs found by fuzzing: CR/CRLF inside section text, frontmatter values ending in
  newlines, whitespace-only multi-line values.
- Topic titles are trimmed.

### Performance

- One-pass journal index: `mentor_doctor` repair on 500 topics went from 50 s to 2 s.
- Frontmatter cache (`.mentor/cache/`, excluded from exports, dropped on deletion): the
  SessionStart hook takes about 280 ms at 150 topics; `next` and `find_topics` run about 6×
  faster on large profiles.

### Tests

- Fuzz and property tests (seeded), tool-input fuzzing, security regression tests, and a
  compatibility fixture with v0.1.0 data; 194 tests in total.
- `scripts/perf.ts` performance probe.

## [0.2.0] - 2026-11-02

Phase 4: deeper analysis, reviews, adaptation, visualisation, continuity. Data schema unchanged (1).

### Added

- `mentor_insights`: patterns across topics with a suggestion each (misconception shared by
  several topics, recurring misconceptions, recent failures rooted in a weak prerequisite,
  regressions, hint dependence, stalled stages, review backlog, provisional prerequisites).
  High-severity insights also appear in the learner card.
- `mentor_progress`: ASCII progress map per subject (level bars, provisional marks, current stage,
  due reviews, misconceptions, missing prerequisites); used by `/learning-mentor:status`.
- `mentor_log_session`: a short session summary and planned next step that the next session
  starts from (shown in the card until newer evidence exists).
- Interleaved review sessions (`mentor_next` with `focus: "review"`) and a `reinforce`
  recommendation after a regression; `mentor_record_evidence` returns a reinforcement suggestion.
- Checkpoint nudge: a lightweight `UserPromptSubmit` hook adds one fact line after every 8 prompts
  in a learning workspace without any recorded progress.
- `/learning-mentor:reflect`: review the conversation for unrecorded evidence and save it after
  the learner confirms.
- More visual patterns (recursion tree, hash table, big-O, TCP handshake, git history).
- Eval cases for scenarios 3, 5, 7, 8, 10 and 11; the teaching-quality rubric is split into four
  graders.

### Fixed

- Windows: line endings are kept as LF (`.gitattributes`); content tests tolerate CRLF.

## [0.1.0] - 2026-11-01

First MVP (pre-release). Data schema 1.

### Added

- Local MCP server with 18 tools: setup, learner context and next steps, topics, evidence,
  manual level, subject and topic paths with stage criteria, profile, settings, research library,
  export, two-step delete (trash or purge), doctor (integrity check and repair from the journal).
- Evidence-based mastery engine: 4 levels plus "not assessed", provisional flag, regression to
  "needs reinforcement" after failed checks, misconception tracking, self-reports and overrides;
  lenient/standard/strict rules.
- Spaced reviews with FSRS (ts-fsrs 5.4), replayed deterministically from the journal.
- SessionStart hook that injects a learner card in registered learning workspaces only.
- Skills: `mentor`, `code-mentor`, `assess`, `source-research`; `researcher` subagent;
  8 commands; opt-in `Mentor` output style.
- Markdown + YAML data format with managed sections, an append-only JSONL journal, atomic writes,
  root lock, backups, trash, quarantine and a secret filter.
- Tests: unit, integration, hook, bundle smoke and architecture rules; behavioural eval suite
  for `claude plugin eval`.
- Sample learner data in `examples/sample-data`.
