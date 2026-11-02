# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/). The on-disk data format has its own version
(`data_schema`, see [docs/DATA_FORMAT.md](docs/DATA_FORMAT.md)).

## [Unreleased]

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
