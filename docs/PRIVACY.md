# Privacy: what Learning Mentor stores

Learning Mentor stores learning data **only on your computer**, in a folder you can read:
`~/LearningMentor`, or the folder set in `LEARNING_MENTOR_HOME`. The plugin's code has no network
access and no telemetry. Claude itself processes your conversation under your normal Claude terms,
as with any conversation.

## What is stored

| File | Contents |
|---|---|
| `learner-profile/profile.md` | Learning goals, background, strengths, weaknesses, recommendations, optional display name |
| `learner-profile/learning-preferences.md` | Observations about what helps you learn ("spatial analogies work well"), pace |
| `learner-profile/subjects/<subject>.md` | Per-subject goal, status, topic levels table, recurring mistakes |
| `knowledge-base/<subject>/<topic>.md` | Topic level and how it was earned, summaries of what you understand and don't yet, mistakes, the last 20 pieces of evidence (short notes and short quotes of your own words), review schedule |
| `learning-paths/…` | Your learning plan: topics, prerequisites, stages and their status |
| `research-library/…` | Notes on public sources: URL, title, publisher, version, key points, short quotes |
| `.mentor/config.yaml` | Your settings and the paths of your learning workspaces |
| `.mentor/journal/*.jsonl` | Append-only history of the changes above (the source for repairs) |
| `.mentor/backups/`, `trash/`, `quarantine/` | Safety copies made before risky operations, deleted items (30 days), damaged files |

Outside the data folder, the checkpoint nudge keeps one tiny file per Claude Code session: a
counter and the id of the last saved change, no text. It lives in Claude Code's plugin data folder
(`~/.claude/plugins/data/…/nudge/`), which is deleted when you uninstall the plugin, or in the
system temp folder if that folder isn't available.

## What is not stored

- Full conversations or transcripts.
- Secrets: notes that look like passwords, API keys, tokens, private keys or credentials in URLs
  are rejected.
- Personal details beyond what learning needs. The mentor is instructed not to record them; a
  display name is optional.

## Your controls

- **See it:** open the folder; `/learning-mentor:status` shows where it is.
- **Export it:** `/learning-mentor:export` (optionally a one-file snapshot).
- **Delete it:** `/learning-mentor:forget <topic|subject|research|all>`. By default items move to
  trash for 30 days; `purge` removes them permanently, including their history in the journal and
  copies in trash and backups. `all` with `purge` removes the whole folder.
- **Stop mentor mode in a folder:** `/learning-mentor:settings` → `remove_workspace`.
- **Uninstalling the plugin keeps your data.** Delete the folder yourself if you want it gone.

## Sharing

The folder is plain text. If you put it under version control or in a synced folder, its contents
go wherever that tool sends them. That is your choice; the plugin never does it.
