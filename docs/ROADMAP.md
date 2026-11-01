# Learning Mentor — Roadmap

> Phase 2 deliverable. Versions follow semver; `0.x` releases may change behaviour, but never
> break stored data without a migration (ARCHITECTURE §13).

## Decisions taken (2026-11-01)

| Topic | Decision |
|---|---|
| Primary surfaces | Claude Code + Cowork full; claude.ai chat methodology-only |
| Coding strictness default | `balanced` assistance ladder; never the learner's full solution |
| License | MIT |
| Conversation language | auto (the learner's language) |
| Repository | dedicated repository `kornegy/learn_AI_plugin-Claude-` (created by the owner 2026-11-01) |

## Overview

```
Phase 2  Architecture ............ done (this document set)
Phase 3  MVP ..................... M0 → M5  → v0.1.0
Phase 4  Advanced ................ M6 → M7  → v0.2.0, v0.3.0
Phase 5  Quality assurance ....... M8       → v0.9.0 (release candidate)
Phase 6  Public release .......... M9       → v1.0.0
```

---

## Phase 3 — MVP

### M0. Bootstrap and spikes

- [ ] Plugin skeleton: `.claude-plugin/plugin.json`, `marketplace.json`, empty skills/commands,
      `hooks/hooks.json`, `.mcp.json`
- [ ] `server/` package: TypeScript 6.0, esbuild, vitest, eslint, prettier; `npm run build` →
      `dist/`
- [ ] CI: lint, typecheck, unit, build-is-clean check, `claude plugin validate --strict`
- [ ] **S1** SessionStart `additionalContext` reaches the model in Claude Code (and in Cowork, if
      available to the owner); record how the card appears
- [ ] **S2** Local MCP from a plugin in Cowork: Node runtime, cwd, file access to the data root
- [ ] **S4** `claude plugin eval` with `history_file` + `llm` grader; measure the cost per case
- [ ] **S5** Skill triggering on 20 RU/EN phrasings ("объясни указатели", "teach me joins",
      "хочу разобраться с fork")
- [ ] **S6** `${user_config.*}` with defaults and `env` passing to MCP servers in Claude Code
      and Cowork

**Exit:** the skeleton installs from a local marketplace and validates; spike results are
recorded in `docs/SPIKES.md`; the architecture is adjusted if a spike fails.

### M1. Storage foundation

- [ ] `core/`: ids, clock (injectable), errors, labels (ru, en)
- [ ] `schema/`: zod schemas for every file kind (DATA_FORMAT §5–§10), journal events,
      migration registry (empty)
- [ ] `storage/`: root resolver, path guard, atomic write, lock, journal, markdown document
      (frontmatter + managed sections + free text preservation), backup, trash, quarantine
- [ ] Secret filter
- [ ] Unit tests incl. Windows-style paths, symlinks, broken markers, oversized files

**Exit:** ≥ 90 % line coverage on `storage/` and `schema/`; property tests: parse → write →
parse is a fixed point.

### M2. Engines

- [ ] Mastery (ARCHITECTURE §6) with table-driven tests covering every rule, strictness and
      regression case
- [ ] Misconception state machine
- [ ] Scheduler wrapper over ts-fsrs 5.4.x (rating mapping, one rating per day)
- [ ] Paths: DAG validation, cycle reporting, stage criteria checking, status transitions
- [ ] Recommender (`next`)
- [ ] Learner card builder with a budget and truncation tests

**Exit:** engine is pure (no I/O imports, enforced by lint); all rule tables have tests.

### M3. MCP server and hook

- [ ] Services: init, context, next, topics, evidence, set_level, paths, stages, profile,
      settings, sources, export, delete (token protocol), doctor
- [ ] MCP adapters for the 17 tools (ARCHITECTURE §9) with model-oriented descriptions
- [ ] `hook.mjs session-start`: workspace detection, card output, error → one fact line, exit 0
- [ ] Integration tests: every tool on a temp root; corrupt/missing files; two concurrent writer
      processes; delete protocol; export; schema-too-new read-only mode
- [ ] Hook tests: inside/outside a workspace, missing root, timing < 300 ms on a 200-topic fixture

**Exit:** all integration and hook tests green; manual smoke test in Claude Code with
`--plugin-dir`.

### M4. Skills, commands, agent

- [ ] `mentor` skill (session loop, Socratic rules, analogies, stages, tone, recording rules,
      no-tools fallback) + references
- [ ] `assess` skill (evidence classification with worked examples per kind/outcome/independence)
- [ ] `code-mentor` skill (7 stages, ladder, "write it for me" protocol, normal-mode exit)
- [ ] `research` skill + `agents/researcher.md` (read-only tools, JSON output contract)
- [ ] Commands: start, status, plan, review, research, settings, export, forget
- [ ] Optional `output-styles/mentor.md`
- [ ] Portable frontmatter check (only keys allowed on claude.ai), SKILL.md < 500 lines and
      < 5k tokens

**Exit:** a manual walkthrough of J1–J13 in Claude Code is recorded in `docs/WALKTHROUGH.md`
with notes on what felt wrong; issues are fixed or filed.

### M5. Behavioural evals and MVP release

- [ ] `evals/` cases for PRODUCT_SPEC §10 release-gate scenarios (1, 2, 4, 6, 9, 12, 13, 14, 15)
- [ ] Baseline comparison run; cost recorded
- [ ] `examples/sample-data/` (a realistic C++ + SQL learner)
- [ ] README (install, quick start, surfaces, privacy summary), CHANGELOG, LICENSE (MIT)

**Exit = v0.1.0:**
- installs by documented steps;
- a new session continues from saved progress;
- per-topic levels;
- paths;
- no learner solutions written;
- the release-gate evals score ≥ 0.8;
- unit, integration and hook tests green.

*FSRS reviews, research library and settings are part of M2–M4. If spikes or the schedule force
cuts, they move to v0.2.0 in this order: settings, research, reviews.*

---

## Phase 4 — Advanced features

### M6 → v0.2.0: depth of understanding and continuity

- [ ] `UserPromptSubmit` checkpoint nudge (fact line when a learning session has gone N turns or
      minutes without a record)
- [ ] `/learning-mentor:reflect`: with consent, re-read the current Claude Code session
      transcript and propose missing records for the learner to confirm
- [ ] Cross-topic misconception analysis in the subject overview and the card
- [ ] Interleaved review sessions across subjects
- [ ] Remaining eval cases (3, 5, 7, 8, 10, 11, 16)

### M7 → v0.3.0: reach and richness

- [ ] Visual patterns library for the most common CS topics (memory, processes, joins, recursion,
      big-O)
- [ ] `export snapshot` → claude.ai Project workflow, documented
- [ ] **S3** `.mcpb` bundle of the same server for Claude Desktop chat; ship if the spike passes
- [ ] `userConfig.data_dir`, if S6 passed
- [ ] Evaluate ts-fsrs 6.x

---

## Phase 5 — Quality assurance (→ v0.9.0)

- [ ] Full eval suite at 3 runs with pinned models; results in `docs/EVAL_REPORT.md`
- [ ] Fuzzing of markdown/frontmatter parsing and tool inputs
- [ ] Windows and macOS runs of unit, integration and hook tests in CI
- [ ] Security review against ARCHITECTURE §12; `docs/PRIVACY.md`; `SECURITY.md`
- [ ] Data migration test from every released schema fixture
- [ ] Beta with 5–10 learners through the project's own marketplace; feedback via GitHub Issues
      (no telemetry)

## Phase 6 — Public release (→ v1.0.0)

- [x] Move to the dedicated repository (done 2026-11-01 with `git subtree split`)
- [ ] Make the repository public (owner's decision)
- [ ] README, ARCHITECTURE, CONTRIBUTING, SECURITY, CHANGELOG, issue and PR templates,
      upgrade guide
- [ ] Marketplace install documented: `claude plugin marketplace add <owner>/learning-mentor`
- [ ] Anthropic Directory pre-submission checklist; submission from the owner's account (owner's
      action)
- [ ] Evaluate standalone binaries for users without Node (outside `bin/`)

## Later (v2 candidates)

Self-hostable remote MCP for chat and mobile persistence; a read-only HTML progress view;
importing existing notes; teacher/peer sharing of paths (never of learner data).

## Risk-driven checkpoints

| When | Check | If it fails |
|---|---|---|
| After M0 | S1 card delivery | Fall back: `mentor` skill calls `mentor_get_context` at the start of every learning conversation |
| After M0 | S2 Cowork MCP | Cowork becomes tier 3 (methodology) until resolved; document it |
| After M0 | S4 eval cost | Reduce runs to 2, rubric-only on gate cases; keep regex/tool graders in CI |
| After M4 | Walkthrough shows tutoring feels heavy | Tune `mentor` skill: shorter replies, fewer checks; re-run case 16 |
| After M5 | Gate evals < 0.8 | No release; iterate skills; no lowering of the threshold |
