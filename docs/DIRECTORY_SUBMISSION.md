# Anthropic plugin directory: submission prep

Status of Learning Mentor 1.0.0 against Anthropic's
[plugin pre-submission checklist](https://claude.com/docs/plugins/pre-submission-checklist) and
[submission guide](https://claude.com/docs/plugins/submit), as of 2026-11-02.

**Submitting is the repository owner's action.** It needs the owner's claude.ai account, with a
plan and role that can submit, and GitHub connected on claude.ai. Nothing here has been
submitted. The portal can validate and accept a private repository. The listing goes live only
after the repository is public.

## Checks this repository runs itself

| Check | How |
|---|---|
| Manifest and component syntax | `claude plugin validate --strict .` (CI, `plugin` job) |
| Directory file rules: ≤ 512 files, each < 5 MiB, no symlinks or submodules, portable names, no system files, no binary types the directory can't inspect | `server/tests/unit/plugin-content.test.ts` → "plugin directory rules" (CI, every OS) |
| No `.gitattributes`, no root `package.json` or lockfile | same test |
| Listing fields: name pattern, description, author, version, license, icon is a PNG, https URLs, README ≥ 40 words outside code blocks | same test |
| Shipped code is readable (not minified) and has license notices | same test, plus the CI check that `dist/` and `THIRD_PARTY_NOTICES.md` are rebuilt exactly from `server/src` |

## Checklist

### Repository and folder layout

| Rule | Status |
|---|---|
| Plugin folder contains `.claude-plugin/plugin.json` | ✅ The plugin is at the repository root (plugin path: empty) |
| One plugin per submission | ✅ The marketplace has one plugin |
| Everything hooks and the MCP server run is inside the plugin folder | ✅ `server/dist/*.mjs` |
| Regular files only (no symlinks, submodules, LFS) | ✅ tested |
| No `.DS_Store`, `Thumbs.db`, `desktop.ini`, `__MACOSX` | ✅ tested |
| Portable file names | ✅ tested |
| No `export-ignore`, `export-subst`, `filter` or other rewriting attributes | ✅ `.gitattributes` removed in 1.0.0 |
| Repository < 50 MiB archived, < 10,000 files, each file < 5 MiB | ✅ about 230 files; the largest is `server/dist/chunks/…` at ≈ 0.95 MB |

### Manifest and name

| Rule | Status |
|---|---|
| `name` lowercase, digits, hyphens | ✅ `learning-mentor` |
| Distinctive name, not only generic words | ⚠️ **Possible policy hold.** `learning-mentor` is made of generic words. The checklist gives `test-plugin` as an example of a name that is held for a reviewer. A hold is not a rejection, and it is the owner's decision whether to rename before the first listing. Renaming later breaks commands (`/learning-mentor:*`), tool permissions (`mcp__plugin_learning-mentor_…`) and user settings, so if it happens, it should happen before 1.0.0 is listed |
| `displayName`, `author.name` in one writing system | ✅ "Learning Mentor", "kornegy" |
| `description`, `author`, `version` set | ✅ |

### README and license

| Rule | Status |
|---|---|
| README ≥ 40 words | ✅ |
| `LICENSE` or `license` | ✅ Both (MIT) |

### Files in the plugin folder

| Rule | Status |
|---|---|
| Non-image files < 256 KiB | ⚠️ **Expected policy hold.** `server/dist/mentor-mcp.mjs` (≈ 0.6 MB), `server/dist/chunks/*.mjs` (≈ 0.95 MB and 0.27 MB). These are the readable bundles of the server (ARCHITECTURE ADR-017) |
| ≤ 512 files | ✅ |
| Only text files, complete PNG/JPEG/GIF/WebP images, fonts | ✅ One PNG: `assets/icon.png` |
| Images referenced only from the README | ✅ The icon is used by `plugin.json` `icon` (a listing field) and the README |
| MCP server declared with `command` + `args`, not a `.mcpb` | ✅ `node ${CLAUDE_PLUGIN_ROOT}/server/dist/mentor-mcp.mjs` |

### What the plugin runs and connects to

| Rule | Status |
|---|---|
| No package launchers (`npx`, `uvx`, …) | ✅ None |
| No registry or package-source config with a launcher or install | ✅ No launcher or install. `server/.npmrc` only sets `legacy-peer-deps` for contributors |
| No credentials in files; no credentials read from the environment | ✅ None. The server reads only `LEARNING_MENTOR_HOME`, a folder path |
| Valid `.mcp.json`; local server started by running a file with plain arguments | ✅ |
| Hook and MCP paths written in full from `${CLAUDE_PLUGIN_ROOT}` | ✅ Exec form, no shell |
| No launchers or installs in hook scripts | ✅ |

### Hooks, skills, commands, agents

| Rule | Status |
|---|---|
| `hooks/hooks.json` valid, known events only | ✅ `SessionStart`, `UserPromptSubmit` |
| `hooks/hooks.json` not repeated in `plugin.json` | ✅ |
| Valid frontmatter with a text `description` | ✅ `claude plugin validate --strict` |
| Exact folder and file names | ✅ |

### Security scan

The README section "What the plugin runs, stores and sends" describes all behaviour: two local
hooks, one local MCP server, files in one data folder, no network access from the plugin's code,
and web research only through Claude's own WebSearch and WebFetch tools in a read-only subagent,
with the user's permission settings. The shipped code is readable, and `server/src` is the source.

## Expected outcome

No blocking findings. Probably one or two **policy holds**: files over 256 KiB, and maybe the
generic name. Both mean that an Anthropic reviewer reads the version before it goes live.

## Answers prepared for the portal

These are suggestions for the owner, who answers in the portal and is responsible for the
answers.

**Source step**
- Repository: `kornegy/learn_AI_plugin-Claude-`
- Plugin path: empty (repository root)
- Branch or tag: `main` (or a release tag such as `v1.0.0`)

**Listing details** come from `plugin.json` (name, displayName, description, icon, URLs) and the
README.

**Data handling**

| Question | Suggested answer |
|---|---|
| Does the plugin read or store personal data? | Yes, locally only. It stores learning data on the user's own computer, in `~/LearningMentor` or `LEARNING_MENTOR_HOME`: learning goals, per-topic levels, short notes and short quotes of the learner's answers, learning plans, saved source notes, settings, and an optional display name. See `docs/PRIVACY.md`. |
| Does it send data to services other than its declared connectors? | No. The plugin's code has no network access and no telemetry. Web research uses Claude's own WebSearch and WebFetch tools, under the user's permission settings. |
| How long is data kept? | Until the user deletes it. `/learning-mentor:forget` moves items to trash, which is emptied after 30 days, or purges them immediately. Uninstalling the plugin does not delete the data folder; the README says so. |
| Intended for people under 18? | The owner decides. The plugin is a general learning tool with no age-specific features, and it is meant for users of Claude, whose own terms apply. |

**Compliance**: a contact email for the owner and the four acknowledgements (owner).

## Owner's steps

1. Merge the release PR, then tag it: `git tag v1.0.0 && git push origin v1.0.0`.
2. Optional: verify Cowork (spike S2) on Claude Desktop and update the README table.
3. Open [claude.ai/directory/manage](https://claude.ai/directory/manage) → **Submit new** →
   **Plugin bundle**, enter the source above, and select **Validate**.
4. Fix anything marked **Blocking** (none expected), re-validate, then fill in the remaining
   steps and select **Submit for review**.
5. Make the repository public when you're ready for the listing to go live. Then select
   **Check for new commits** on the plugin's page.
