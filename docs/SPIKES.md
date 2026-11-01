# Technical spikes (ROADMAP M0)

Results of the checks planned in [ROADMAP.md](ROADMAP.md). Environment: Linux, Claude Code
2.1.316, Node 22, plugin installed from a local marketplace into an isolated `CLAUDE_CONFIG_DIR`.

| # | Question | Result | Evidence |
|---|---|---|---|
| S1 | Does SessionStart `additionalContext` reach the model? | ✅ **Yes (Claude Code).** In a fresh headless session in a learning workspace, with tool use forbidden by the prompt, Claude correctly reported the current stage, the open misconception, the overdue reviews and the preferred analogy type | Live run; hook output is also covered by `tests/hooks` |
| S1b | Is a facts-only card enough to change behaviour? | ⚠️ **Not alone.** With facts only, "write it for me" got the full solution. Stating that the folder treats requests as learning exercises and naming the skills made `code-mentor` load reliably (eval 06: 1.00 over 3 runs) | `docs/EVAL_REPORT.md` |
| S2 | Local MCP from a plugin in Cowork | ⏳ **Not verified.** Needs Claude Desktop with Cowork on the owner's machine. The plugin has no `bin/` and no `userConfig`, so Cowork can install it | To do by the owner: install from the marketplace and run `/learning-mentor:status` in a Cowork project |
| S3 | `.mcpb` bundle for Claude Desktop chat | ⏳ Deferred to v0.3.0 | — |
| S4 | `claude plugin eval` with real servers: mechanics and cost | ✅ **Works.** Scaffold seeding into the run's temporary HOME, real MCP server and hook. ≈ $0.05 per run; full suite (9 cases × 3 runs × 2 arms) ≈ $2.80 | `docs/EVAL_REPORT.md` |
| S5 | Skill triggering on natural RU/EN phrasing | ✅ **4/4 correct.** "Хочу разобраться, как работают указатели" and "Teach me how SQL LEFT JOIN works…" → `mentor`; "What port does HTTPS use?" and "Rename foo to bar" → no skill | Live runs outside a workspace |
| S6 | `${user_config.*}` and env passing to MCP servers | ⏳ Partly. Env from Claude Code's process reaches both the hook and the MCP server (`LEARNING_MENTOR_HOME` worked in all live runs). `userConfig.data_dir` is postponed until verified in Cowork | Live runs |

## Bundling finding

A dynamic `import()` in server code made esbuild wrap the module, and zod with it, in a lazy
initialiser. The MCP SDK then ran before zod was initialised (`Class is not a constructor`), so
the bundled server crashed on start while all source-level tests passed. Fixed by removing the
dynamic import. Guarded by an architecture test and by `tests/integration/bundle.test.ts`, which
starts the real bundle over stdio.
