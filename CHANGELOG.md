# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/). The on-disk data format has its own version
(`data_schema`, see [docs/DATA_FORMAT.md](docs/DATA_FORMAT.md)).

## [Unreleased]

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
