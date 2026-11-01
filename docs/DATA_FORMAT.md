# Learning Mentor — Data Format (schema 1)

> Phase 2 deliverable. This document is normative: the zod schemas in `server/src/schema/` must
> match it, and changes to it follow the compatibility rules in ARCHITECTURE.md §13.

## 1. Principles

- One learner per data root.
- Plain text: Markdown with YAML frontmatter for documents, JSONL for the journal, YAML for
  configuration.
- Machine-owned structure (frontmatter, server sections) is separate from text the learner or
  the model may write.
- History is never rewritten. It lives in the journal; documents hold current state plus
  readable summaries.
- All dates are ISO 8601. `day` fields are local calendar dates (`YYYY-MM-DD`). Timestamps include
  the UTC offset (`2026-11-01T18:40:12+03:00`).
- Encoding UTF-8, line endings `\n`. A final newline is required.

## 2. Directory layout

```
<root>/                                   default ~/LearningMentor, or $LEARNING_MENTOR_HOME
├── README.md                             human explanation of this folder (written by mentor_init)
├── learner-profile/
│   ├── profile.md                        goals, background, strengths, weaknesses, recommendations
│   ├── learning-preferences.md           observed perception and explanation preferences
│   └── subjects/
│       └── <subject>.md                  per-subject overview (levels table is server-rendered)
├── knowledge-base/
│   └── <subject>/
│       └── <slug>.md                     one file per topic: state + summaries + evidence digest
├── learning-paths/
│   └── <subject>/
│       ├── _path.md                      subject path: goal, topic DAG, recommended order
│       └── <slug>.md                     topic path: stages with criteria and status
├── research-library/
│   └── <subject>/                        `general` for cross-subject material
│       └── <source-slug>.md              one file per source
└── .mentor/
    ├── meta.yaml                         data_schema, created, plugin_version_last_write
    ├── config.yaml                       settings and registered workspaces
    ├── journal/YYYY-MM.jsonl             append-only event log
    ├── lock                              present only while a write is in progress
    ├── backups/<timestamp>-<reason>/     copies made before risky operations (last 20 kept)
    ├── trash/<timestamp>/                deleted items (30 days)
    └── quarantine/<timestamp>/           corrupt files moved aside by doctor
```

## 3. Identifiers

| Id | Pattern | Example |
|---|---|---|
| subject | `^[a-z0-9][a-z0-9-]{0,47}$`, not a Windows reserved name, not `general` for learning subjects | `cpp`, `system-programming` |
| topic | `<subject>/<slug>`, slug with the same pattern | `cpp/pointers` |
| stage | `^[a-z0-9][a-z0-9-]{0,47}$`, unique within a topic path | `dereferencing` |
| misconception | same pattern, global across subjects | `addr-vs-value` |
| source | `<subject>/<slug>` | `cpp/cppreference-pointer-declaration` |
| event | ULID (26 chars, time-sortable) | `01JBX7…` |

Ids are always English kebab-case; titles and text may be in any language. `aliases` hold
alternative names, such as other languages and abbreviations, for `mentor_find_topics`.

## 4. Managed sections

Bodies consist of sections delimited by markers. The heading inside a section is localised and
may be edited by the learner; the marker name is the stable key.

```markdown
<!-- mentor:section <name> -->
## <localised heading>
<content>
<!-- mentor:end -->
```

| Mode | Who writes | Behaviour |
|---|---|---|
| `replace` | model via tools | the content is replaced |
| `append` | model via tools | new bullet lines are appended, each prefixed with `day ·` |
| `server` | server only | regenerated on each write; manual edits there are overwritten (documented in the folder README) |

Text outside any section is free text and is preserved verbatim. A missing section is created at
the end of the document. A broken marker (an opening marker with no `mentor:end`) makes the
document corrupt (`E_CORRUPT`).

Limits: a section is at most 8 000 characters. In `append` sections, the oldest bullets beyond
the limit are moved into a `<!-- mentor:archive -->` block at the end of the file, so nothing is
lost.

## 5. Learner profile

### 5.1. `learner-profile/profile.md`

```yaml
---
schema: 1
kind: profile
created: 2026-11-01
updated: 2026-11-01
display_name: null          # optional; never required
background: []              # short strings, e.g. "2 years of Python scripting"
goals: []                   # e.g. "become a junior systems programmer"
strengths: []
weaknesses: []
recommendations: []         # individual study recommendations, written by the mentor
---
```

Sections: `notes` (append).

### 5.2. `learner-profile/learning-preferences.md`

```yaml
---
schema: 1
kind: preferences
updated: 2026-11-01
observed:                   # what works for this learner, with evidence day
  - { day: 2026-10-28, note: "Spatial analogies (houses, shelves) land better than abstract ones" }
pace: null                  # null | slow | medium | fast   (observed, not configured)
explanation_depth: null     # null | brief | standard | deep
---
```

Sections: `notes` (append). Explicit choices made by the learner live in `.mentor/config.yaml`.
This file holds what the mentor *observes*.

### 5.3. `learner-profile/subjects/<subject>.md`

```yaml
---
schema: 1
kind: subject
id: cpp
title: "C++"
aliases: ["c++", "cpp", "си плюс плюс"]
started: 2026-10-01
updated: 2026-11-01
goal: "Write and debug small systems programs on my own"
status: active              # active | paused | completed
strengths: []
weaknesses: []
recurring_errors: []        # misconception ids
---
```

Sections: `levels` (server; a table of topic → level label, provisional flag, review due) and
`notes` (append).

## 6. Topic (`knowledge-base/<subject>/<slug>.md`)

```yaml
---
schema: 1
kind: topic
id: cpp/pointers
subject: cpp
title: "Указатели"
aliases: ["pointers", "pointer"]
created: 2026-10-20
updated: 2026-10-28
prerequisites: [cpp/variables, cpp/memory-basics]
level: 3                    # null | 1 | 2 | 3 | 4
provisional: false
level_source: evidence      # evidence | self_report | override
regressed_on: null          # day of the last regression (ARCHITECTURE §6.3) or null
last_assessed: 2026-10-28   # last day with non-exposure evidence
evidence_counts:            # convenience digest; the journal is authoritative
  recognition: 1
  recall: 2
  explanation: 1
  application: 1
  transfer: 0
misconceptions:
  - id: addr-vs-value
    description: "Confuses the address of a variable with its value"
    status: resolving       # open | resolving | resolved | recurring
    first_seen: 2026-10-20
    last_seen: 2026-10-27
    occurrences: 3
review:                     # null until level first reaches 3
  due: 2026-11-03
  stability: 4.21
  difficulty: 6.08
  reps: 2
  lapses: 0
  state: review             # new | learning | review | relearning (ts-fsrs)
  last_review: 2026-10-28
---
```

| Section | Mode | Content (spec name in brackets) |
|---|---|---|
| `summary` | replace | short description of the topic [Краткое описание] |
| `studied` | append | what has been covered [Что уже изучено] |
| `understands` | append | what the learner understands, with the day [Что понимает] |
| `gaps` | append | what is not understood yet [Что пока не понимает] |
| `errors` | server | rendered from misconceptions and recent failures [Допущенные ошибки] |
| `evidence` | server | last 20 evidence events, one line each [Доказательства понимания] |
| `to_review` | append | what needs revisiting [Что необходимо повторить] |

The current level and the last check date [Текущий уровень, Последняя дата проверки] are shown in
a one-line server-rendered `status` section at the top of the body.

Evidence line format (`evidence` section):
`2026-10-28 · explanation · success · independent · review — "a pointer is like a note with a flat's address"`

## 7. Research source (`research-library/<subject>/<source-slug>.md`)

```yaml
---
schema: 1
kind: source
id: cpp/cppreference-pointer-declaration
subject: cpp
topics: [cpp/pointers]
url: "https://en.cppreference.com/w/cpp/language/pointer"   # https only
title: "Pointer declaration"
publisher: "cppreference.com"
tier: 2                     # 1 official docs · 2 standards/specs · 3 academic · 4 technical guides · 5 articles
technology: "C++"
technology_version: "C++23"
published: null             # day or null
accessed_at: 2026-11-01
verified_at: 2026-11-01
volatility: stable          # fast_moving | stable | foundational → TTL from config
conflicts: []               # e.g. "Older tutorial X recommends raw new/delete; modern guidance prefers smart pointers"
---
```

| Section | Mode | Content |
|---|---|---|
| `key_points` | replace | own-words summary, max 15 bullets |
| `quotes` | replace | at most 5 quotes of at most 25 words each, with an anchor or section reference |
| `notes` | append | how this source was used in teaching |

Freshness, computed rather than stored: `fresh` if `today − verified_at ≤ ttl`, `stale` if
`≤ 2 × ttl`, `expired` otherwise.

Validation in `mentor_save_source`:
- `https:` only, no credentials in the URL, length ≤ 2 048;
- text fields stripped of HTML tags and control characters;
- limits enforced;
- the secret filter is applied.

## 8. Learning paths

### 8.1. Subject path (`learning-paths/<subject>/_path.md`)

```yaml
---
schema: 1
kind: subject_path
subject: cpp
goal: "Write and debug small systems programs on my own"
created: 2026-10-01
updated: 2026-11-01
topics:                     # order = recommended order; must be a topological order of the DAG
  - { id: cpp/variables, prerequisites: [] }
  - { id: cpp/memory-basics, prerequisites: [cpp/variables] }
  - { id: cpp/pointers, prerequisites: [cpp/variables, cpp/memory-basics] }
  - { id: cpp/references, prerequisites: [cpp/pointers] }
  - { id: cpp/dynamic-memory, prerequisites: [cpp/pointers] }
---
```

Sections: `overview` (server; status of each topic: done, current, available or blocked with
reasons) and `notes` (append). A topic's `prerequisites` in the topic file and in the path must
agree; the path is authoritative and `mentor_plan_path` syncs topic files.

### 8.2. Topic path (`learning-paths/<subject>/<slug>.md`)

```yaml
---
schema: 1
kind: topic_path
topic: cpp/pointers
goal: "Use pointers to read and modify values, including through function parameters"
created: 2026-10-20
updated: 2026-10-28
next_topics: [cpp/references, cpp/dynamic-memory]
stages:
  - id: why-pointers
    title: "Зачем нужны указатели"
    goal: "Explain two problems pointers solve"
    criteria: [ { kind: explanation, min: 1 } ]
    status: done
    started: 2026-10-20
    completed: 2026-10-20
  - id: dereferencing
    title: "Как работает разыменование"
    goal: "Predict and explain the result of *p reads and writes"
    criteria:
      - { kind: explanation, min: 1 }
      - { kind: application, min: 1, independent: false }
    status: active
    started: 2026-10-28
  - id: practice
    title: "Практическое закрепление"
    goal: "Solve a small task using pointers without hints"
    criteria: [ { kind: application, min: 1, independent: true } ]
    status: pending
---
```

`criteria[].independent: true` requires independent evidence; `false` accepts either. All
criteria require `outcome: success` (partial counts per ARCHITECTURE §6.1). Allowed status
transitions: `pending → active → done | skipped`, `active → pending`; `done` and `skipped` are
final. Skipping requires `skip_reason`. Sections: `overview` (server) and `notes` (append).

## 9. Configuration (`.mentor/config.yaml`) and meta

```yaml
schema: 1
language: auto
explanation_style: analogy-first
assessment_strictness: standard
review_intensity: normal
assistance_level: balanced
learning_mode: guided
research:
  auto: true
  ttl_days: { fast_moving: 90, stable: 365, foundational: 1095 }
workspaces:
  - "/home/me/learning"      # real paths
```

```yaml
# .mentor/meta.yaml
data_schema: 1
created: 2026-10-01T10:00:00+03:00
plugin_version_last_write: 0.1.0
```

## 10. Journal (`.mentor/journal/YYYY-MM.jsonl`)

One JSON object per line:

```json
{"v":1,"id":"01JBX7Q8…","ts":"2026-10-28T19:02:11+03:00","day":"2026-10-28","type":"evidence_recorded",
 "topic":"cpp/pointers","data":{"kind":"explanation","outcome":"success","independence":"independent",
 "context":"learning","note":"explained address vs value","quote":"…","addresses":["addr-vs-value"]}}
```

| `type` | `data` |
|---|---|
| `initialized` | root, plugin version |
| `config_changed` | changed keys (old → new) |
| `workspace_registered` / `workspace_removed` | path |
| `topic_created` / `topic_updated` | changed fields (not section text) |
| `evidence_recorded` | evidence (ARCHITECTURE §6.1) |
| `level_changed` | from, to, provisional, reason (`evidence`, `regression`, `override`, `self_report`) |
| `override` | level, reason |
| `misconception_changed` | id, from, to |
| `review_updated` | rating, due, stability, difficulty |
| `path_created` / `path_updated` | subject, added/removed topics |
| `stage_changed` | topic, stage, from, to, override_reason? |
| `profile_updated` | target, added/removed items |
| `source_saved` | source id, url, tier |
| `export` | destination, snapshot |
| `delete` / `purge` | scope, target, counts |
| `migration` | from schema, to schema, files |
| `repair` | file, action |

Rules: lines ≤ 4 KB; `note` and `quote` ≤ 300 characters; unknown `type`s are ignored by older
readers; events are never edited, except removed by `purge`.

## 11. Compatibility checklist for contributors

- Adding an optional field: allowed in a minor release; give it a default in the zod schema.
- Adding a section: allowed in a minor release; readers create missing sections.
- Renaming or removing a field or section, or changing its meaning: requires a migration and a
  `data_schema` bump.
- Every migration ships with a fixture of the old schema in `tests/fixtures/schema-N/` and a test
  that upgrades it.
