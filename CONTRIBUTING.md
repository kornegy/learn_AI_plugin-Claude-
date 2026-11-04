# Contributing to Learning Mentor

Thanks for helping! Learning Mentor has two kinds of code:

- **Server** (`server/`): TypeScript MCP server and hook. Deterministic and covered by
  unit and integration tests.
- **Model-facing content** (`skills/`, `commands/`, `agents/`, `output-styles/`): the teaching
  method. Covered by behavioural evals in `evals/`.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md)
before larger changes. Open an issue first for anything that changes behaviour or the data format.

## Setup

```bash
cd server && npm ci
```

- Node.js 20 or later. Use `npm ci`; the repo's `.npmrc` sets `legacy-peer-deps` to work around
  an npm peer-resolution bug with vitest.
- `npm run check` runs typecheck, all tests and the build.

## Rules for server changes

- Layering: `engine/` is pure (no I/O, no clock), `storage/` is the only filesystem code, `mcp/`
  and `hook/` call `services/`. `tests/unit/architecture.test.ts` enforces this.
- No network code, no telemetry, and no dynamic `import()` (it breaks the esbuild bundle).
- Every write goes through the root lock and appends to the journal before changing files.
- **Rebuild and commit `server/dist/` and `THIRD_PARTY_NOTICES.md`** whenever you change
  `server/src` or a dependency. Plugins install without a build step; CI fails if either is
  stale. The build is deliberately not minified (ARCHITECTURE ADR-017): keep it that way.
- **Windows:** the repository has no `.gitattributes`, because Anthropic's plugin directory
  rejects attributes that rewrite files. Clone with `git config --global core.autocrlf false`
  (or `input`) so that a rebuilt `dist/` matches the committed LF files.
- Data format changes follow [docs/DATA_FORMAT.md §11](docs/DATA_FORMAT.md): optional fields are
  fine; renames and removals need a migration, a `data_schema` bump and a fixture test.

## Rules for skills and commands

- Keep `SKILL.md` frontmatter portable: only `name`, `description`, `license`, `compatibility`,
  `metadata`, `allowed-tools`. Otherwise claude.ai rejects the upload.
- Keep each `SKILL.md` under 500 lines and about 5k tokens. Put details in `references/`.
- Learner card text is **facts**; instructions belong in skills.
- Run the relevant evals and paste the scores in your PR:

  ```bash
  claude plugin eval . --case 06-write-it-for-me --scaffold --allow-real-servers --allow-tools "mcp__plugin_learning-mentor_learning-mentor__*" --trust-plugin --max-cost-usd 2
  ```

  Evals call the model on your own account. Use `--runs 1 --ablation none` while iterating.

## Adding an eval case

Create `evals/<nn-name>/` with `prompt.md` (the learner's message), `case.yaml`
(`scaffold_script: seed.sh`), `seed.sh` (calls `../_shared/seed.sh sample|empty|corrupt`) and one
or more `graders/*.md`. Pair a result grader (`regex` or `llm` with concrete PASS/FAIL conditions)
with a process grader (`tool_used`).

## Commit and PR

- Small, focused commits with descriptive messages.
- Fill in the PR template checklist.
- Never commit personal learning data, secrets or tokens.

## Code of conduct

Be kind, the way we want the mentor to be: patient, clear, never condescending.
