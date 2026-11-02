# Learning Mentor — Architecture

> Phase 2 deliverable, updated after the Phase 3 MVP. Status: **implemented in v0.1.0**; deviations
> from the original design are marked *(v0.1.0)*.
> Companion documents: [PRODUCT_SPEC.md](PRODUCT_SPEC.md) (what the learner experiences),
> [DATA_FORMAT.md](DATA_FORMAT.md) (on-disk format), [ROADMAP.md](ROADMAP.md) (delivery plan),
> [RESEARCH.md](RESEARCH.md) (Phase 1 findings, in Russian).

---

## 1. Goals and non-goals

**Goals**

1. Every learning session continues the learner's individual education. Claude knows what was
   studied, how well, which mistakes recur and what comes next, without the learner re-explaining.
2. Claude never claims to remember anything that is not in the conversation or in the learner's
   files.
3. Understanding is judged on evidence, per topic, on a 4-level scale, and is kept separate from
   forgetting.
4. Claude teaches like a mentor: Socratic questions, analogies, small stages. In programming it
   never writes the learner's solution.
5. Data is local, human-readable, exportable, deletable and protected from corruption.
6. The design is understandable, testable and maintainable by an open-source community.

**Non-goals for v1**

- A hosted service, user accounts or a remote MCP server.
- Memory in plain claude.ai chat. Chat gets the methodology skills only; see §2.
- Flash-card UI, dashboards, LMS integration, grading for institutions.
- Analysing a past conversation in the background with an extra LLM call.

---

## 2. Surfaces and capability tiers

Plugin component support differs by surface (official table, RESEARCH.md §2.1). We design for
graceful degradation:

| Tier | Surface | What the learner gets |
|---|---|---|
| **1** | Claude Code (CLI, IDE, desktop Code tab) | Everything: memory, auto-loaded learner card, research library, optional output style |
| **1** | Cowork (session on the user's computer) | Everything except the output style |
| **3** | claude.ai chat (web, desktop chat, mobile) | Methodology only: Socratic mentor, analogies, stages, coding mentor. No persistence |
| 2 (Phase 4, after spike S3) | Claude Desktop chat with the `.mcpb` bundle | Methodology + persistence through tools, no auto-loaded card |

**Rule for every component:** the methodology lives in skills, which load on every surface. The
skills must work, honestly and without errors, when the MCP tools are missing. If the
`mentor_*` tools are not available, the mentor says progress will not be saved in this
environment and teaches anyway.

---

## 3. Component view

```
┌──────────────────────────────── learning-mentor plugin ────────────────────────────────┐
│                                                                                         │
│  skills/                        ← model-facing methodology (all surfaces)               │
│    mentor/       session protocol, Socratic method, analogies, stages, visuals, tone    │
│    assess/       evidence classification rubric, level semantics                        │
│    code-mentor/  7-stage programming protocol, assistance ladder, "write it for me"     │
│    source-research/ source policy, freshness, prompt-injection rules                    │
│                                                                                         │
│  commands/       start · status · plan · review · research · settings · export · forget │
│  agents/         researcher.md  (WebSearch + WebFetch only; Code, Cowork)               │
│  output-styles/  mentor.md      (opt-in, Claude Code only, never forced)                │
│  hooks/hooks.json                                                                       │
│    SessionStart(startup|resume|clear|compact) → node dist/hook.mjs session-start        │
│    UserPromptSubmit → node dist/nudge.mjs   (v0.2.0, separate light bundle, ~50 ms)     │
│  .mcp.json → node dist/mentor-mcp.mjs                                                   │
│                                                                                         │
│  server/  (TypeScript → two esbuild bundles, committed to git)                          │
│   ┌──────────────────────────────────── mentor-core ─────────────────────────────────┐  │
│   │ core/      ids · clock · errors · config · labels(i18n)                          │  │
│   │ schema/    zod schemas per file kind + journal events + migrations registry      │  │
│   │ storage/   root resolver · path guard · atomic write · lock · journal ·          │  │
│   │            markdown doc (frontmatter + managed sections) · backup · trash ·      │  │
│   │            quarantine                                                            │  │
│   │ engine/    mastery · misconceptions · scheduler (ts-fsrs) · paths (DAG, stages)  │  │
│   │            · recommender (next) · research cache · context card · secret filter  │  │
│   │ services/  one service per use case, used by both MCP tools and the hook         │  │
│   └──────────────────────────────────────────────────────────────────────────────────┘  │
│   mcp/   server.ts + tools/*.ts  (thin adapters: validate input → service → render)     │
│   hook/  hook.ts                 (session-start, checkpoint-nudge)                      │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                       │ reads/writes ONLY inside the data root
                       ▼
       ~/LearningMentor/  learner-profile/ knowledge-base/ learning-paths/ research-library/ .mentor/
```

### 3.1. Responsibilities

| Concern | Owner | Why |
|---|---|---|
| What to ask, which analogy, how long the answer is, when to move on | **Model** (skills) | Pedagogy is judgement |
| Classifying a learner's answer as evidence (kind, outcome, independence, misconception) | **Model** (`assess` skill) | Needs the conversation |
| Turning evidence into a level, a review date, an allowed stage transition | **Code** (engine) | Must be deterministic, consistent and testable |
| Today's date, ids, file format, history, safety | **Code** (core, storage) | The model can't do these reliably |
| Loading the learner's state into a new session | **Hook** | Must not depend on the model remembering to ask |

### 3.2. Layering rules

- `mcp/` and `hook/` depend on `services/`, never on `storage/` directly.
- `engine/` is pure: no I/O, no clock. Time and data are passed in, so it is unit-testable with
  plain values.
- `storage/` is the only module that touches the filesystem.
- Nothing in `server/` accesses the network. No `fetch` and no `http` imports, enforced by
  `tests/unit/architecture.test.ts` (ADR-008).
- *(v0.1.0)* No runtime dynamic `import()`: it makes esbuild wrap zod lazily and the bundled server
  crashes on start (see docs/SPIKES.md). Also enforced by the architecture test.

---

## 4. Activation model (learning workspaces)

The coding-mentor rules must not leak into the user's normal engineering work (R1 in RESEARCH.md).

- **Registered workspaces.** `/learning-mentor:start` asks for or confirms a folder and calls
  `mentor_init { workspace_path }`. The server stores the folder's real path in
  `.mentor/config.yaml → workspaces[]`. The server never writes outside the data root, so
  activation leaves no files in the user's projects.
- **Hook behaviour.** `session-start` resolves the real path of `cwd` and checks whether it is
  equal to or inside a registered workspace:
  - **inside:** it prints the learner card (§8) with the fact line
    `Learning workspace: active (<path>)`;
  - **outside:** it prints nothing. Zero context cost and no behaviour change.
- **Outside a workspace** the skills stay discoverable through their descriptions. If the learner
  asks to *learn* something, the `mentor` skill loads, calls `mentor_get_context` and asks one
  question: track this as a learning session, or just answer?
- **Exit.** In a workspace, "I just need working code now" switches the conversation to normal
  mode. The `mentor` skill records nothing and does not argue.
- **Cowork.** A Cowork project whose folder is a registered workspace behaves the same, because
  hooks load in Cowork.
- **No forced output style.** `output-styles/mentor.md` exists for people who want it in their
  learning folder (`/output-style Mentor`). `force-for-plugin` is never set (ADR-005).

---

## 5. Runtime flows

### F1. Session start

```
Claude Code            hook.mjs session-start              data root
    │  SessionStart{cwd, source}  │                              │
    ├────────────────────────────▶│ resolve root, read config    │
    │                             ├─────────────────────────────▶│
    │                             │ cwd inside a workspace? ─ no ─▶ exit 0, no output
    │                             │ yes: build card (CardService)│
    │                             │◀─────────────────────────────┤ frontmatter scan
    │◀── stdout JSON additionalContext (≤ 4 000 chars, facts) ───┤
```

- Matchers `startup|resume|clear|compact`. On `compact` the card is re-injected after the
  conversation has been summarised.
- Time budget: target < 300 ms, hook `timeout: 10` s. Any error prints one fact line
  (`Learning Mentor: data could not be read (<code>); run /learning-mentor:status.`) and exits 0.
  The hook never blocks a session.
- If the data root does not exist yet, the hook prints nothing. Onboarding is explicit.

### F2. New topic

```
learner: "I want to understand pointers"
mentor skill → mentor_find_topics{query:"pointers", subject:"cpp"} ── no match / match
           → (no match) mentor_upsert_topic{topic_id:"cpp/pointers", title, prerequisites:[...]}
           → mentor_get_topic → prerequisites with levels
           → if prerequisites are unknown or weak: 1–2 probe questions → mentor_record_evidence(diagnostic)
           → mentor_plan_topic{stages:[...] with criteria}
           → (if versioned tech and no fresh source) researcher subagent → mentor_save_source
           → teach stage 1
```

### F3. Recording evidence (the core write path)

```
mentor skill ─ mentor_record_evidence{topic_id, events[]} ─▶ EvidenceService
   1. validate input (zod), secret filter on notes/quotes
   2. acquire lock
   3. read topic (validate; corrupt → E_CORRUPT, nothing is written)
   4. append events to journal (fsync)                         ← commit point
   5. engine.mastery(all topic evidence, config) → level, provisional, misconceptions
   6. engine.scheduler(review state, qualifying events, today) → next due
   7. write topic file atomically (frontmatter + evidence section)
   8. if level changed: append level_changed event; refresh subject overview
   9. release lock
◀─ {level_before, level_after, provisional, review_due, misconceptions[], notes[]}
```

The journal append (step 4) is the commit point. If the process dies after step 4, `doctor`
rebuilds the topic's structured fields from the journal, because mastery is a pure function of
the evidence (§6).

### F4. Return after a break

The card lists overdue reviews first. The `mentor` skill protocol: greet → offer the recommended
next step from `mentor_next` (overdue reviews come before new material, at most 3) → a review is a
*retrieval* question, never a re-explanation → `mentor_record_evidence{context:"review"}`.

### F5. Research

```
main ─▶ Agent(researcher){topic, technology, version, questions}
         tools: WebSearch, WebFetch only. No Write/Edit/Bash, no MCP.
         returns JSON: sources[{url, title, publisher, tier, technology_version, published?,
                                key_points[], short_quotes[], conflicts[]}], gaps[]
main ─▶ mentor_save_source × n   (server validates and stores; sets accessed_at, ttl)
main ─▶ uses the summaries and cites the sources in the explanation
```

Offline or with the tools denied, the researcher reports that it cannot reach the web. The mentor
says so and uses `mentor_find_sources`, which reports freshness, or its own knowledge, marked as
unverified.

### F6. Coding mentor

The `code-mentor` skill runs 7 stages: understand the task → concepts → logic → design →
learner implements → analyse the result → consolidate. Each stage maps to a stage in the topic
path with machine-checkable criteria (§7.2). The assistance ladder (PRODUCT_SPEC §6.3) governs
every reply. Claude may read the learner's files and run their code or tests when asked. It does
not edit the learner's solution files in a learning workspace, except for files the learner
explicitly asks it to scaffold that do not solve the task: build configs, test harness stubs.

### F7. Export and delete

- `mentor_export{snapshot?}` copies the data root to `~/LearningMentor-export-<timestamp>/`. With
  `snapshot`, it also writes one Markdown file `learner-snapshot.md` (profile, levels, paths,
  misconceptions) that can be uploaded to a claude.ai Project.
- `mentor_delete{scope, target?}` has two steps (§10.4). By default deleted items go to
  `.mentor/trash/` and are kept for 30 days. `purge: true` removes them permanently, including
  their journal events.

### F8. Corruption and recovery

A file that fails parsing or schema validation is never overwritten. The service returns
`E_CORRUPT` with the path. `mentor_doctor{repair:true}`:
1. copies the bad file to `.mentor/quarantine/<timestamp>/`;
2. rebuilds its structured fields from the journal, if it is a topic;
3. keeps any body text it can still read;
4. writes a valid file and appends a `repair` event.

A missing file is treated like a corrupt one if the journal shows it existed; otherwise it does
not exist. Missing folders are recreated.

---

## 6. Mastery engine (normative)

Mastery is a **pure, deterministic function** `level(evidence[], misconceptions[], config) → {level, provisional}`.
It is recomputed from the full evidence history on every write. The input is small, so this is
cheap, and it guarantees that the files and the journal never disagree.

### 6.1. Evidence

| Field | Values |
|---|---|
| `kind` | `exposure` · `self_report` · `recognition` · `recall` · `explanation` · `application` · `transfer` |
| `outcome` | `success` · `partial` · `fail` |
| `independence` | `independent` · `assisted` (with `hint_level` 1–5, from the assistance ladder) |
| `context` | `learning` · `review` · `diagnostic` |
| `misconception` | optional `{id, description}`: the error reflects a stable wrong belief |
| `reported_level` | `self_report` only: 1–4 |
| `note`, `quote` | short text (≤ 300 chars each), secret-filtered |
| `day` | local calendar date assigned by the server |

**Normalisation:** `partial` on `application` is treated as `assisted success`. `partial` on
`explanation`, `recall` or `recognition` is treated as `fail` for level purposes, but is kept in
the history. `exposure` never affects the level.

### 6.2. Base level from a set of events E

Let:
- `S(kind)` = successful events of that kind in E;
- `indepAppDays` = number of distinct `day`s with an independent successful `application`;
- `hasExpl` = `S(explanation) ≠ ∅`;
- `hasTransfer` = `S(transfer) ≠ ∅`;
- `assistedApp` = some successful `application` was assisted;
- `openMisc` = some misconception has status `open` or `recurring`.

| Strictness | Level 4 requires |
|---|---|
| `lenient` | `hasExpl` ∧ (`indepAppDays ≥ 1` ∨ `hasTransfer`) |
| `standard` (default) | `hasExpl` ∧ (`indepAppDays ≥ 2` ∨ `hasTransfer`) |
| `strict` | `hasExpl` ∧ `indepAppDays ≥ 2` ∧ `hasTransfer` |

```
base(E) =
  4    if the Level-4 rule holds and not openMisc
  3    else if hasExpl or assistedApp or indepAppDays ≥ 1 or hasTransfer
  2    else if S(recall) ∪ S(recognition) ≠ ∅
  1    else if E has any non-exposure, non-self_report event   (only failures)
  null else                                                     (not assessed)
```

An open misconception therefore caps the level at 3.

### 6.3. Regression ("needs reinforcement")

A **regression day** is a day `d` where:
- the level computed from the events before `d` is ≥ 3, and
- on day `d`, events with `context ∈ {review, diagnostic}` contain either
  - ≥ 2 failures, or
  - ≥ 1 failed `recall` or `application` and no success of those kinds.

Let `R` be the latest regression day, `A` the events after `R`, and `X` the successful
explanations before `R`. If `R` exists:

```
r     = base(A ∪ X)
level = r  if r ≥ 3 and A contains a successful recall, explanation, application or transfer
        2  otherwise
```

The learner has to show the knowledge again after the regression day. When they do, earlier
explanations still count, but earlier applications do not and must be repeated.

This implements "don't lower the level on one random slip". A single failure on a day that
also has successes is not a regression. A single failed review recall is one.

### 6.4. Provisional flag and self-report

- Weights of successful events: recognition 1, recall 2, explanation 3, assisted application 3,
  independent application 5, transfer 6.
- `provisional = (Σweights < threshold)` with threshold lenient 3 / standard 5 / strict 8.
- If E contains only `self_report` events, the level is the latest `reported_level` with
  `provisional = true`. The skill must probe it at the next opportunity. Any other evidence
  overrides self-reports.
- A topic with `level ≥ 3` that is still `provisional` counts as a satisfied prerequisite, but
  `mentor_get_topic` flags it so the mentor probes it with one question.

### 6.5. Misconceptions

States: `open → resolving → resolved`, plus `recurring`.

| Transition | Trigger |
|---|---|
| new → `open` | a `fail` event carries a misconception id not seen before (ids are kebab-case, chosen by the model) |
| `open` → `resolving` | a later successful explanation, application or transfer on the topic that the model tags with that misconception id (`addresses: [id]`) |
| `resolving` → `resolved` | a second such success on a different day |
| `resolved` → `recurring` | the same id appears again in a failure |
| `recurring` | treated as `open`, `occurrences` incremented |

Misconception ids are global across subjects, for example `addr-vs-value`. The subject overview
and the learner card can then show cross-topic patterns.

### 6.6. Manual override

`mentor_record_evidence` accepts no level. The only way to set a level directly is
`mentor_set_level{topic_id, level, reason}`, used when the learner disputes an assessment. It
appends an `override` event. The override wins until the next evidence event after it, and is
shown as "(set manually)".

---

## 7. Scheduling and paths

### 7.1. Reviews (FSRS)

- Library: `ts-fsrs` **5.4.x** (6.0.0 was released 2026-10-28 and will be evaluated later).
- A review card is created the first time `level ≥ 3` and is stored in the topic frontmatter
  (`review.*`).
- **Qualifying event:** `recall`, `explanation`, `application` or `transfer` with
  `context = review`, or any context on or after the due date. At most one rating per topic per
  day: the first qualifying event of the day.
- **Rating:** `fail` → Again; assisted or partial success → Hard; independent success → Good;
  successful `transfer` → Easy.
- `review_intensity`: light / normal / intensive → `request_retention` 0.85 / 0.90 / 0.95.
- The level is never changed just because a review is due. A failed review can trigger a
  regression (§6.3).

### 7.2. Paths and stages

- **Subject path:** a DAG of topics with `prerequisites`. `mentor_plan_path` rejects cycles
  (`E_CYCLE`, listing the cycle) and unknown ids, unless `create_missing: true`, which creates
  stub topics with `level: null`.
- **Topic path:** an ordered list of stages. Each stage has `id`, `title`, `goal`, `criteria[]`,
  `status ∈ {pending, active, done, skipped}`, `started`, `completed`, `skip_reason`.
- **Criteria are machine-checkable:** `{kind, min: n, independent?: bool, outcome: success}`, for
  example "1 explanation and 1 assisted-or-better application". `mentor_update_stage{status:"done"}`
  succeeds only if evidence recorded after `started` satisfies all criteria. Otherwise it returns
  `E_CRITERIA_UNMET` listing what is missing. `override_reason` lets the mentor skip the check;
  this is journaled and shown.
- **Completed stages are immutable.** Re-planning can only change `pending` stages
  (`mode: "replace_pending"`).
- **Adaptive insertion:** when a topic regresses to 2, the recommender proposes a review stage,
  and the mentor may insert it with `mentor_plan_topic{mode:"insert"}`.

### 7.3. Recommender (`mentor_next`)

Priority order, truncated to the top 5 items:
1. overdue reviews, sorted by overdue days, at most 3;
2. the active stage of the most recently active topic;
3. open or recurring misconceptions without a remediation stage;
4. the next topic in the subject path in topological order, whose prerequisites are all `≥ 3`;
5. topics blocked by prerequisites, with the missing prerequisites listed.

Each item has a one-line `why`.

### 7.4. Insights *(v0.2.0)*

`engine/insights.ts` turns topic state and evidence into actionable patterns, sorted by severity:

| Insight | Rule | Suggestion |
|---|---|---|
| `cross_topic_misconception` (high) | same unresolved misconception id in ≥ 2 topics | fix the shared idea once, then re-check each topic |
| `recurring_misconception` (high) | a misconception came back after `resolved` | new representation; learner explains why the wrong model fails |
| `weak_prerequisite` (high) | ≥ 2 failures on a topic in 14 days and a prerequisite is null, ≤ 2 or provisional | check that prerequisite first |
| `regression` (medium) | level 2 after a regression in the last 30 days | insert a reinforcement stage |
| `hint_dependence` (medium) | ≥ 3 successful applications, all assisted | fade hints |
| `review_backlog` (medium) | ≥ 5 reviews due | short interleaved review sessions |
| `stalled_stage` (low) | a stage active > 14 days | split it or revisit its prerequisite |
| `probe_provisional` (low) | a provisional level ≥ 3 is a prerequisite of a topic in progress | confirm with one question |

High-severity insights appear in the learner card (quoted). The recommender adds `reinforce`
after a regression until the topic plan is updated, and interleaves due reviews across
subjects (round-robin, most overdue first).

### 7.5. Checkpoint nudge *(v0.2.0)*

`UserPromptSubmit` runs `dist/nudge.mjs`, a separate bundle without zod or services (~50 ms).
Inside a workspace it compares the newest journal event id with the one seen at the previous
prompt of the same session (`${CLAUDE_PLUGIN_DATA}/nudge/<session>.json`). After every 8 prompts
without a change it adds one fact line. It never blocks, and outside workspaces it prints nothing.

---

## 8. Learner card (context injection)

- Built by `CardService` and used by both the hook and `mentor_get_context`.
- **Facts only, no imperatives.** Hook context written as instructions may be treated as a
  prompt-injection attempt; the instructions live in the skills.
- *(v0.1.0)* The workspace line states what the folder is for and names the skills. Live tests
  showed that a facts-only card did not make Claude load `code-mentor` for "write it for me"
  requests (ADR-015).
- Budget: **≤ 4 000 characters** (the platform cap is 10 000). Sections are filled in priority
  order and truncated with `… (+N more; use mentor_next)`.

```
Learning Mentor — learner card (data as of 2026-11-01, local time 18:40)
Learning workspace: active (/home/me/learning). The learner set this folder up for learning: requests here,
  including requests for code, are learning exercises, and the rules the learner chose for replies are in the
  skills learning-mentor:mentor and learning-mentor:code-mentor (…).
Settings: language=auto, style=analogy-first, strictness=standard, assistance=balanced, mode=guided
Active subjects: cpp (goal: systems programming job-ready), sql
Current: cpp/pointers — stage 5/8 "Dereferencing" (active since 2026-10-28)
Due reviews: cpp/references (overdue 3 days), sql/joins (due today)
Recurring misconceptions: addr-vs-value (cpp/pointers, cpp/references; seen 3×)
Recent levels: cpp/pointers 3 Partial understanding · cpp/variables 4 Solid · sql/joins 2 Needs reinforcement
Last session: 2026-10-28 — explained address vs value; struggled with *p in function args
Learner preferences: prefers short steps and spatial analogies; English terms with Russian explanations
Tools: mentor_* tools available for details and for recording progress.
```

---

## 9. MCP tool contracts (v1)

All tools take zod-validated input. They return a short human-readable `text` for the model and
`structuredContent` with the full object. Errors set `isError` with a code and an actionable
message (§11). Ids are English kebab-case: `subject` matches `^[a-z0-9][a-z0-9-]{0,47}$`, and a
topic id is `<subject>/<slug>` with the same slug rule. Titles may be in any language.

| Tool | Input (main fields) | Output | Writes |
|---|---|---|---|
| `mentor_init` | `workspace_path?`, `language?` | root path, created folders, workspaces | config, folders |
| `mentor_get_context` | `subject?` | learner card + structured state | — |
| `mentor_next` | `subject?`, `focus?: all\|review` | prioritised recommendations (§7.3); `review` = due reviews interleaved across subjects | — |
| `mentor_insights` *(v0.2.0)* | `subject?` | cross-topic patterns with suggestions (§7.4) | — |
| `mentor_progress` *(v0.2.0)* | `subject?` | ASCII progress map per subject | — |
| `mentor_log_session` *(v0.2.0)* | `summary`, `next_step?`, `topics?` | saved; shown in the next card | journal |
| `mentor_find_topics` | `query`, `subject?`, `limit≤20` | matches `{id,title,aliases,level,provisional,score}` | — |
| `mentor_get_topic` | `topic_id`, `evidence_limit≤50` | record, prerequisites with levels, stages, recent evidence, misconceptions | — |
| `mentor_upsert_topic` | `topic_id`, `title`, `aliases?`, `prerequisites?`, `sections?{summary,studied,understands,gaps,to_review}`, `section_mode: replace\|append` | record | topic |
| `mentor_record_evidence` | `topic_id`, `events[1..10]` (§6.1), `addresses?` | level change, review due, misconception changes | journal, topic, subject overview |
| `mentor_set_level` | `topic_id`, `level 1–4`, `reason` | record | journal, topic |
| `mentor_plan_path` | `subject`, `goal`, `topics[{topic_id,title,prerequisites}]`, `create_missing?`, `mode: create\|merge` | path with order and blocked info | path, stub topics |
| `mentor_plan_topic` | `topic_id`, `goal`, `stages[]`, `mode: create\|replace_pending\|insert`, `after_stage_id?` | topic path | topic path |
| `mentor_update_stage` | `topic_id`, `stage_id`, `status`, `override_reason?` | stage, unmet criteria | topic path, journal |
| `mentor_update_profile` | `target: profile\|preferences\|subject:<id>`, `add?`, `remove?` per list field, `notes?` | profile | profile files |
| `mentor_settings` | `set?` (partial config) | effective config | config |
| `mentor_save_source` | source record (DATA_FORMAT §7) | stored record, freshness | source |
| `mentor_find_sources` | `subject?`, `topic_id?`, `query?`, `include_stale?` | sources with `fresh\|stale\|expired` | — |
| `mentor_export` | `snapshot?` | export path(s) | export dir |
| `mentor_delete` | `scope: topic\|subject\|research\|all`, `target?`, `purge?`, `confirmation_token?` | step 1: what would be deleted + token; step 2: result | trash / removal |
| `mentor_doctor` | `repair?` | integrity report, actions taken | quarantine, repaired files |

21 tools (v0.2.0). Tool descriptions are written for the model, ≤ 2 sentences each, and say *when* to
use the tool. Claude Code defers MCP tool schemas when there are many tools, so the context cost
is acceptable.

---

## 10. Storage design

### 10.1. Data root resolution

1. Environment variable `LEARNING_MENTOR_HOME`, if set (absolute path).
2. Otherwise `~/LearningMentor` (`os.homedir()`).

Claude Code `userConfig.data_dir` is postponed until spike S6 confirms how `${user_config.*}`
defaults behave in Cowork (RESEARCH.md §2.1). `${CLAUDE_PLUGIN_DATA}` is never used for learner
data, because it is deleted on uninstall (ADR-004).

### 10.2. Safety rules (path guard)

- Tools never accept file paths, except `mentor_init.workspace_path`. That path is only stored,
  never written to. All other paths are built from validated ids.
- Every resolved path must pass `path.relative(root, p)` with no leading `..`, and must not be
  absolute.
- `lstat` before each write: symlinks inside the root are refused for writes and followed for
  reads only if their target is inside the root.
- Windows reserved names (`con`, `nul`, …) are rejected by the id regex.
- Read limit: 512 KB per document and 64 MB per monthly journal file. Larger files are reported
  by `doctor` and not loaded.
- *(v0.9.0)* Only kebab-case names (`<slug>.md`, `_path.md`, slug folders) are read. Other files
  are ignored and only counted, so their names never reach the model.
- *(v0.9.0)* The filesystem root, the home folder and its ancestors are rejected as data root and
  as workspace.
- *(v0.9.0)* Structural markers (`<!-- mentor:…`) inside written text are neutralised.

### 10.3. Writes, locking, journal

- **Atomic write:** write `<file>.tmp-<pid>-<rand>` in the same directory → `fsync` → `rename`.
  On Windows, retry `rename` on `EPERM`/`EBUSY` up to 5 times.
- **Lock:** `.mentor/lock`, created with `O_EXCL` and containing `{pid, host, started}`. Retry
  with backoff for up to 5 s. A lock older than 30 s whose pid is gone is stale and is taken
  over. One lock for the whole root is enough: writes are small and infrequent. *(v0.9.0)* Only
  one process at a time may break a stale lock (it holds `<lock>.break`, created with `O_EXCL`).
  It re-reads the lock and deletes it only if it still holds the stale content, so a fresh lock
  can never be removed. A breaker file left by a crash expires after the same 30 s.
- **Frontmatter cache** *(v0.9.0)*: `.mentor/cache/frontmatter.json` holds parsed frontmatter
  keyed by inode, size and mtime, because YAML parsing dominates bulk loads. It is derived and
  disposable: stale or invalid entries fall back to a full read, it is excluded from exports, and
  it is dropped on every deletion.
- **Journal index** *(v0.9.0)*: histories of many topics come from one pass over the journal
  (`JournalIndex`), never from a scan per topic.
- **Journal:** `.mentor/journal/YYYY-MM.jsonl`, one event per line, ≤ 4 KB per line, appended
  with `O_APPEND` and then `fsync`. It is append-only, except for `purge` (§10.4), which rewrites
  affected lines and records the purge itself.
- **Backups:** before a migration, a repair, a purge or a bulk re-plan, the affected files are
  copied to `.mentor/backups/<timestamp>-<reason>/`. The last 20 backups are kept.

### 10.4. Delete protocol

1. `mentor_delete{scope, target}` returns a summary (counts of files and events) and a
   `confirmation_token`: 8 random characters, valid for 10 minutes, held in server memory.
2. The mentor shows the summary to the learner and asks for explicit confirmation.
3. `mentor_delete{…, confirmation_token}` moves the items to `.mentor/trash/<timestamp>/`. With
   `purge: true`, it removes the files, the trash copies and the journal events for that scope.
   `scope: all, purge: true` removes the whole data root, including `.mentor/`.
4. Trash older than 30 days is removed on the next `mentor_init` or `mentor_doctor` run.

### 10.5. Markdown documents

- YAML frontmatter is owned by the server and validated on every read.
- The body consists of **managed sections** delimited by HTML comments, so headings can be
  localised and the learner can add free text between sections:

```markdown
<!-- mentor:section summary -->
## Кратко
…
<!-- mentor:end -->
```

- Section modes: `replace` (summary), `append` (studied, understands, gaps, to_review), and
  `server` (evidence, levels table), which the server renders and the model never writes.
- Text outside managed sections is preserved verbatim on every write.

---

## 11. Error handling

| Code | Meaning | Model-facing message pattern |
|---|---|---|
| `E_NOT_INITIALIZED` | data root missing | "Learning Mentor is not set up. Suggest /learning-mentor:start." |
| `E_INVALID_INPUT` | zod failure | field path + expected format |
| `E_NOT_FOUND` | unknown id | "Unknown topic cpp/pointr. Similar: cpp/pointers." |
| `E_CORRUPT` | file fails parse or schema | path + "run mentor_doctor with repair:true" |
| `E_LOCKED` | lock not acquired in 5 s | "Another session is writing; retry." |
| `E_CYCLE` | prerequisite cycle | the cycle |
| `E_CRITERIA_UNMET` | stage completion without evidence | missing criteria |
| `E_CONFIRMATION_REQUIRED` / `E_CONFIRMATION_INVALID` | delete protocol | — |
| `E_SECRET_DETECTED` | secret filter hit | which field; the value is never echoed |
| `E_SCHEMA_TOO_NEW` | data written by a newer plugin | "Update the plugin; data is opened read-only." |

The hook maps every error to a single fact line and exit code 0.

---

## 12. Security and privacy

### 12.1. Threat model (summary)

| Asset | Threat | Mitigation |
|---|---|---|
| Learner data | Accidental deletion by the model | Two-step delete with token; trash by default; backups |
| Learner data | Corruption: manual edits, crashes, concurrent sessions | Validation on read, atomic writes, lock, journal, quarantine, doctor |
| Filesystem | Path traversal through ids or crafted files | Id regex, path guard, symlink policy, no path inputs |
| Model behaviour | Prompt injection from web pages | Read-only researcher subagent; summaries only; `save_source` validation; skill rules |
| Model behaviour | Prompt injection from data files (shared or edited profiles) | The card renders data as quoted facts with length limits; skills say file content is data |
| Privacy | Secrets or PII stored in notes | Secret filter (key, token, password and private-key patterns, high-entropy strings) → `E_SECRET_DETECTED`; skill rule: no personal data beyond what learning needs |
| Privacy | Data leaving the machine | No network code in the server; no telemetry; research uses Claude's own tools under the user's permissions |
| Supply chain | Malicious dependency | 4 runtime dependencies (MCP SDK, zod, yaml, ts-fsrs), pinned by lockfile, bundled; Dependabot; `npm audit` in CI |

### 12.2. Data transparency

`docs/PRIVACY.md` (Phase 5) lists every file and field stored. `/learning-mentor:status` shows
the data root path. The data is plain text the learner can read.

---

## 13. Versioning and compatibility

- **Plugin version:** semver in `plugin.json`, bumped on every release.
- **Data schema:** an integer `schema` in every file and `data_schema` in `.mentor/meta.yaml`.
- **Migrations:** `schema/migrations/NNN-description.ts`, forward only, idempotent. They run on
  first write access, after a backup, and append a `migration` event.
- **Compatibility promise:**
  - a minor plugin release may add optional fields and migrations, but never removes or renames
    fields without a migration;
  - a major release may drop migrations older than two majors.
- **Newer data than the plugin understands** (`E_SCHEMA_TOO_NEW`): read-only mode. The card still
  works for known fields; writes are refused.
- **Unknown frontmatter fields** are preserved on write (zod `passthrough`), so an older plugin
  does not destroy data from a newer one.

---

## 14. Configuration

`.mentor/config.yaml`, edited through `/learning-mentor:settings` → `mentor_settings`. See
PRODUCT_SPEC §8 for the meaning of each option.

```yaml
schema: 1
language: auto              # auto | BCP-47 tag (ru, en, …)
explanation_style: analogy-first   # analogy-first | example-first | concept-first
assessment_strictness: standard    # lenient | standard | strict
review_intensity: normal           # light | normal | intensive
assistance_level: balanced         # supportive | balanced | strict
learning_mode: guided              # guided | socratic | practice | exam
research:
  auto: true
  ttl_days: { fast_moving: 90, stable: 365, foundational: 1095 }
workspaces: []
```

---

## 15. Build and packaging

- **Runtime dependencies:** `@modelcontextprotocol/sdk` 1.32.x, `zod` 4.x, `yaml` 2.x,
  `ts-fsrs` 5.4.x.
- **Dev dependencies:** TypeScript 6.0.x, esbuild, vitest. *(v0.1.0)* Layering and privacy rules
  are enforced by architecture tests rather than eslint.
- `esbuild` produces `server/dist/mentor-mcp.mjs` and `server/dist/hook.mjs`: minified
  single-file ESM, Node ≥ 20 target, dependencies inlined, no `node_modules` at install time
  (≈ 0.9 MB and 0.65 MB).
- `dist/` is committed. CI rebuilds it and fails if the result differs from the committed files.
- Node is invoked by name (`"command": "node"`). If Node is missing, Claude Code shows that the
  MCP server failed to start. README documents the requirement. Phase 6 evaluates standalone
  binaries outside `bin/`.
- `claude plugin validate --strict` runs in CI.

```json
// .mcp.json
{ "mcpServers": { "learning-mentor": {
    "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/server/dist/mentor-mcp.mjs"] } } }
```

```json
// hooks/hooks.json
{ "hooks": { "SessionStart": [ { "matcher": "startup|resume|clear|compact", "hooks": [
    { "type": "command", "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/server/dist/hook.mjs", "session-start"], "timeout": 10 } ] } ] } }
```

---

## 16. Test architecture

| Layer | Scope | Location | Runs |
|---|---|---|---|
| Unit | engine (mastery tables, regression, provisional, misconceptions, FSRS mapping, DAG, recommender, card budget), path guard, secret filter, markdown sections, migrations | `tests/unit` | every commit |
| Integration | MCP server via the SDK client over in-memory transport, against a temp data root: every tool, corrupt and missing files, concurrent writers (two processes), delete protocol, export, schema-too-new | `tests/integration` | every commit |
| Hook | spawn `dist/hook.mjs` with fixture stdin: inside and outside a workspace, missing root, corrupt files, size budget, < 300 ms | `tests/hooks` | every commit |
| Fixtures | valid sample root, corrupt variants, older schema versions | `tests/fixtures`, `examples/sample-data` | — |
| Manifest | `claude plugin validate --strict` | CI | every commit |
| Behaviour | `claude plugin eval` cases (PRODUCT_SPEC §10) with `llm` rubrics and a no-plugin baseline; `history_file` for multi-turn; mock MCP for offline and poisoned-source cases | `evals/` | manually or by PR label, `--max-cost-usd` |

Engine tests are table-driven: each row is an evidence sequence with the expected level,
provisional flag and regression. The rule tables in §6 are the spec for these tests.

---

## 17. Architecture decision records

| ADR | Decision | Alternatives rejected | Reason |
|---|---|---|---|
| 001 | Primary surfaces are Claude Code and Cowork; chat gets methodology only | Remote MCP for all surfaces in v1 | Hooks and local MCP are ignored in chat; a hosted service conflicts with local-first and adds cost |
| 002 | A local stdio MCP server owns all writes | The model edits Markdown with its own file tools | Format drift and corruption risk; untestable rules; no path safety |
| 003 | Markdown + YAML frontmatter + JSONL journal | SQLite; JSON only | Human-readable, git-friendly, and still validatable |
| 004 | Data root `~/LearningMentor`, overridable by env | `${CLAUDE_PLUGIN_DATA}` | That directory is deleted on uninstall |
| 005 | Activation by registered workspaces; output style opt-in | Always on; `force-for-plugin` | Must not break normal engineering work |
| 006 | Level = deterministic function of model-classified evidence | The model assigns levels directly | Consistency, testability, no inflation |
| 007 | Understanding level separate from retention (FSRS) | One combined level | Different phenomena; avoids false downgrades |
| 008 | Research through a read-only subagent; server has no network code | The server fetches pages | Isolates untrusted content; respects user permissions |
| 009 | TypeScript/Node, esbuild single-file bundles committed | Python; compiled binaries | Reference SDK; Node ships with Claude Desktop; no install step |
| 010 | Delete goes to trash by default; purge on request with a token | Immediate delete | Protection from accidents plus a real erasure option |
| 011 | Assistance ladder, `balanced` by default; a full solution is never given | Absolute no-code rule | Worked-example effect for novices |
| 012 | Managed sections delimited by HTML comments | Fixed English headings | Localised headings, preserves learner's free text |
| 013 | MIT license; conversation language detected automatically | Apache-2.0; fixed language | Owner's decision (2026-11-01) |
| 014 | "Different sessions" in the mastery rules means different calendar days | Session ids | Surface-independent; matches the spacing effect |
| 015 | *(v0.1.0)* The card's workspace line names the mentor skills and says requests there are learning exercises | Facts-only card; forced output style | Live test: a facts-only card did not change behaviour; a forced style would affect all projects |
| 016 | *(v0.1.0)* Reviews (FSRS cards) start only from demonstrated evidence, not from self-reports or overrides | Start from any level ≥ 3 | Self-reported knowledge isn't something to schedule reviews for until it is shown |
