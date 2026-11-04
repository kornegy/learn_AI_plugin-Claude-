# Learning Mentor

![Learning Mentor icon: an open book with a rising learning path](assets/icon.png)

**A personal learning mentor for Claude that remembers what you actually know.**

Learning Mentor turns Claude into a patient, Socratic mentor with long-term memory. It tracks
your understanding of every topic with evidence rather than impressions. It plans your learning
path, brings topics back for review before you forget them, and helps you write your own
solutions instead of writing them for you. Everything it stores is plain text in a local folder
that you own.

> **Version 1.0.0.** Tested in Claude Code. Cowork support is designed but not yet verified. See
> [Where it works](#where-it-works).

---

## What it does

- **Continues where you stopped.** In your learning folder, every new session starts with a short
  learner card: current stage, due reviews, recurring mistakes, recent levels. You don't have to
  explain who you are again. It never claims to remember anything that isn't saved.
- **Judges understanding by evidence.** Each topic has its own level: *New to me → Needs
  reinforcement → Partial understanding → Solid*. Reading an explanation never raises a level,
  and neither does a lucky guess. Explaining in your own words, solving on your own and
  applying it in a new situation do. A single slip doesn't lower it.
- **Teaches like a mentor.** Small steps, one question at a time, analogies that say where they
  stop being accurate, ASCII diagrams when structure matters.
- **Never writes your exercise for you.** In programming it walks you through understanding,
  logic, design, your own implementation and analysis. Hints come up a ladder: question → idea →
  plan together → syntax on an unrelated example → a worked example of a *different* problem.
  If you really just need working code, say so and it switches to normal mode for that task.
- **Plans and reviews.** Learning paths with prerequisites, stage plans with checkable goals, and
  spaced reviews scheduled with [FSRS](https://github.com/open-spaced-repetition/ts-fsrs),
  interleaved across subjects. After a failed review, it adds a short reinforcement stage.
- **Spots patterns.** It notices the same misconception across topics, failures that come from a
  weak prerequisite, and dependence on hints. It shows your progress as a map, and it
  remembers what you planned for next time.
- **Researches sources.** For versioned technology it checks current, authoritative sources
  through an isolated research agent, then saves cited notes with versions and freshness dates.
- **Keeps your data yours.** Local Markdown files, an append-only history, export, trash and
  permanent deletion. No telemetry, and no network access from the plugin's code.

## Where it works

| | Claude Code | Cowork | claude.ai chat (web, desktop, mobile) |
|---|---|---|---|
| Mentor methodology (skills) | ✅ | ✅ | ✅ |
| Memory between sessions (local MCP server) | ✅ | ⚠️ expected, not yet verified | ❌ chat ignores local plugin servers |
| Learner card at session start, checkpoint nudge (hooks) | ✅ | ⚠️ expected, not yet verified | ❌ chat ignores hooks |
| Research agent | ✅ | ✅ | ❌ (chat uses its own web search) |

In plain chat, the mentor teaches with the same method but says it cannot save progress. You can
export a one-file snapshot (`/learning-mentor:export snapshot`) and add it to a claude.ai Project.

## Requirements

- Claude Code 2.1.275 or later
- **Node.js 20 or later** on your `PATH`. The plugin's memory server and its two hooks are small
  Node programs. Check with `node --version`; install from [nodejs.org](https://nodejs.org) if
  needed. Claude Code's native installer doesn't include Node.

Without Node, Claude Code still starts. The mentor skills still work, but nothing is saved, and the
mentor tells you that its server needs Node.js.

## Install

Add this repository as a marketplace and install the plugin:

```bash
claude plugin marketplace add kornegy/learn_AI_plugin-Claude-
```

```bash
claude plugin install learning-mentor@learning-mentor-marketplace
```

Or, inside a Claude Code session:

```text
/plugin marketplace add kornegy/learn_AI_plugin-Claude-
```

```text
/plugin install learning-mentor@learning-mentor-marketplace
```

Restart Claude Code after installing.

## Quick start

1. Create a folder for learning and start Claude Code there:

   ```bash
   mkdir -p ~/learning && cd ~/learning && claude
   ```

2. Run `/learning-mentor:start`. It asks up to four short questions (your goal, what you already
   know, how you like explanations, your language), registers this folder as your **learning
   workspace**, and drafts a learning path.
3. Learn. Next time, open Claude Code in the same folder and say "continue". The mentor knows
   where you stopped.

Mentor mode is on by default **only inside learning workspaces**. In your other projects Claude
behaves normally and writes code as usual. Outside a workspace, asking to *learn* something makes
the mentor offer once to track it.

### Progress map (`/learning-mentor:status`)

```text
C++ — Самостоятельно писать и отлаживать небольшие системные программы
████ 4  variables      Хорошо знаю ↻
███░ 3  memory-basics  Есть понимание, но слабое ↻
███░ 3  pointers       Есть понимание, но слабое ▶ 3/5 Разыменование ↻ ⚠ addr-vs-value
···· –  references     Не оценено
···· –  dynamic-memory Не оценено
Итого: 1 хорошо · 2 частично · 0 повторить · 0 новое · 2 не оценено
Легенда: ████ уровень 1–4 · ? предварительно · ▶ текущий этап · ↻ пора повторить · ⚠ заблуждение
```

### Example

From a real session (the learner was studying pointers and had confused `&x` with `*p`):

```text
You: Напиши за меня функцию swap(int* a, int* b). Мне просто нужен готовый код.

Mentor: Понимаю, тебе нужно, чтобы это просто заработало. Это ровно твоя текущая тема,
разыменование, так что давай напишем вместе. Тут всего 3 строки.
Первый шаг: в первой строке сохрани во временную переменную tmp то, что лежит в коробке
по адресу a. Подумай, что туда положить: a или *a?
…Если сейчас тебе не до учёбы, напиши «просто дай код», и я напишу его целиком.
Это не будет засчитано как практика.
```

## Commands

| Command | What it does |
|---|---|
| `/learning-mentor:start [goal]` | Onboarding: profile, learning workspace, first learning path |
| `/learning-mentor:status [subject]` | Levels per topic, current stage, due reviews, data folder |
| `/learning-mentor:plan [subject\|topic]` | Show or change your learning path or a topic's stages |
| `/learning-mentor:review [subject]` | Spaced-review session: short retrieval questions |
| `/learning-mentor:research <topic>` | Find and save current sources with versions and freshness |
| `/learning-mentor:settings [key value]` | Language, explanation style, strictness, reviews, hints, mode |
| `/learning-mentor:reflect [topic]` | Find learning progress in this conversation that wasn't saved, and save it after you confirm |
| `/learning-mentor:export [snapshot]` | Export all data, optionally as one Markdown snapshot |
| `/learning-mentor:forget <scope> [purge]` | Delete a topic, a subject, research notes or everything (with confirmation) |

The skills `mentor`, `code-mentor`, `assess` (knowledge check) and `source-research` load
automatically when relevant.

## Settings

| Setting | Values (default first) |
|---|---|
| `language` | `auto` (the language you write in), or a code such as `ru`, `en` |
| `explanation_style` | `analogy-first`, `example-first`, `concept-first` |
| `assessment_strictness` | `standard`, `lenient`, `strict`: how much evidence *Solid* needs |
| `review_intensity` | `normal`, `light`, `intensive`: target recall 0.90 / 0.85 / 0.95 |
| `assistance_level` | `balanced`, `supportive`, `strict`: how quickly hints are given |
| `learning_mode` | `guided`, `socratic`, `practice`, `exam` |

Change them with `/learning-mentor:settings`.

## Your data

Data lives in `~/LearningMentor` by default. Set `LEARNING_MENTOR_HOME` to an absolute path to use
another folder (for example a synced or version-controlled one).

```text
~/LearningMentor/
├── learner-profile/     goals, observed preferences, per-subject overview
├── knowledge-base/      one file per topic: level, what you understand, evidence
├── learning-paths/      your plan per subject and the stages of each topic
├── research-library/    notes on sources: links, versions, freshness
└── .mentor/             settings, append-only journal, backups, trash
```

See [examples/sample-data](examples/sample-data) for a realistic learner, and
[docs/PRIVACY.md](docs/PRIVACY.md) for exactly what is stored.

- **Export:** `/learning-mentor:export`.
- **Delete:** `/learning-mentor:forget`. Deleted items go to trash for 30 days; `purge` deletes
  permanently, including history.
- **Uninstalling the plugin does not delete your learning data.** Remove `~/LearningMentor`
  yourself if you want it gone.
- If a file gets damaged, ask the mentor to run a repair: `mentor_doctor` quarantines the file and
  rebuilds it from the journal.

## What the plugin runs, stores and sends

| Part | What it does | Runs |
|---|---|---|
| `SessionStart` hook (`server/dist/hook.mjs`) | In a registered learning workspace, reads your data folder and adds the learner card to the session. Elsewhere it prints nothing | Locally, at session start |
| `UserPromptSubmit` hook (`server/dist/nudge.mjs`) | In a learning workspace, counts prompts and adds one line if nothing was saved for 8 prompts. It ignores what you write and never stores it | Locally, on each prompt |
| MCP server `learning-mentor` (`server/dist/mentor-mcp.mjs`) | 21 tools that read and write the data folder | Locally, over stdio |
| `researcher` agent | Looks up current sources with Claude's own WebSearch and WebFetch tools, under your permission settings | Only when you ask for research, or when a versioned topic needs checking |
| Skills, commands, output style | Instructions for Claude | No code |

- **Stores:** your learning data only in your data folder (see [Your data](#your-data)). The
  nudge hook also keeps a tiny per-session counter (a number and the id of the last saved change, no text) in Claude Code's
  plugin data folder, or in the system temp folder if that isn't set.
- **Sends:** nothing. The plugin's code makes no network requests and has no telemetry or
  analytics. Your conversation itself is processed by Claude as usual.
- **Fetches:** nothing by itself. Web pages are fetched only by Claude's web tools during
  research, and you can deny them.
- **Code:** the shipped programs in `server/dist/` are readable (not minified) and are built
  from `server/src`; CI checks that they match. Bundled open-source packages are listed in
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Updating

```bash
claude plugin marketplace update learning-mentor-marketplace
```

```bash
claude plugin update learning-mentor@learning-mentor-marketplace
```

Restart Claude Code afterwards. Updating never touches your data folder. Every data file records
its format version; all releases so far use the same format, so nothing needs converting. An
older plugin version refuses to change data written in a newer format and asks you to update.
See the [upgrade guide](docs/UPGRADING.md) for rollbacks and troubleshooting.

## How it works

```text
skills (methodology)  ─┐
commands               ├─ plugin ─▶ Claude Code / Cowork
researcher agent       │
SessionStart hook ─────┤   prints the learner card in learning workspaces
UserPromptSubmit hook ─┤   one fact line if a learning session goes 8 messages without saved progress
local MCP server ──────┘   21 tools; computes levels, reviews, paths and insights; validates and writes files
```

The model classifies what you showed: explanation, application, a misconception… The server
turns that evidence into levels with deterministic rules, so the same evidence always gives the
same level, and every file can be rebuilt from the journal. Details:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATA_FORMAT.md](docs/DATA_FORMAT.md),
[docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md). Background research (in Russian):
[docs/RESEARCH.md](docs/RESEARCH.md).

## Development

```bash
cd server && npm ci && npm run check
```

```bash
claude plugin validate --strict .
```

Behavioural evals make real model calls, billed to your account:

```bash
claude plugin eval . --scaffold --allow-real-servers --allow-tools "mcp__plugin_learning-mentor_learning-mentor__*" --trust-plugin --max-cost-usd 5
```

See [CONTRIBUTING.md](CONTRIBUTING.md), the latest [eval report](docs/EVAL_REPORT.md), the
[QA report](docs/QA_REPORT.md) (security review, fuzzing, performance) and the
[directory submission prep](docs/DIRECTORY_SUBMISSION.md).

## Support

Questions, bugs and teaching feedback: [GitHub issues](https://github.com/kornegy/learn_AI_plugin-Claude-/issues).
Security reports: see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Bundled third-party packages: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
