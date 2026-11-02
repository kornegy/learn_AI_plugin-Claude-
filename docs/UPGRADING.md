# Upgrading Learning Mentor

This guide covers updating the plugin, what happens to your learning data, and how to go back
to an earlier version.

## Update the plugin

Claude Code keeps you on the installed version until you update. A new release is a new
`version` in `.claude-plugin/plugin.json`.

1. Refresh the marketplace, so Claude Code sees the new version:

   ```bash
   claude plugin marketplace update learning-mentor-marketplace
   ```

2. Update the plugin:

   ```bash
   claude plugin update learning-mentor@learning-mentor-marketplace
   ```

3. Restart Claude Code. Running sessions keep the old version until they restart.

Inside a session you can do the same from `/plugin`, on the **Installed** tab. If you installed
the plugin from Anthropic's plugin directory on claude.ai, the directory delivers new versions
for you.

After updating, `/learning-mentor:status` shows that everything loads. To check your data
explicitly, ask the mentor to "run the data check", which calls `mentor_doctor`.

## Your data during an upgrade

Your learning data lives outside the plugin, in `~/LearningMentor` or the folder set in
`LEARNING_MENTOR_HOME`. Updating or uninstalling the plugin never touches it.

- **Data format.** Every file records its data schema (`data_schema` in `.mentor/meta.yaml`,
  `schema` in each file). All releases so far, from 0.1.0 to 1.0.0, use **schema 1**, so no
  conversion has ever been needed. Fields added in later versions are optional, and older files
  get defaults when they are read.
- **If a future version changes the schema,** its release notes will say so here and in the
  changelog. Such a release must convert your files forward and back them up first, and it must
  ship a test that upgrades real data of the old schema ([DATA_FORMAT.md §11](DATA_FORMAT.md)).
- **An older version never damages newer data.** If it finds a file with a newer schema, it
  stops with `E_SCHEMA_TOO_NEW` ("Update the learning-mentor plugin; nothing was changed") and
  writes nothing.
- **Before a big upgrade,** you can make your own copy with `/learning-mentor:export`, or simply
  copy the data folder.

## Go back to an earlier version

Each release is tagged in this repository as `v<version>`, starting with `v1.0.0`. To pin an
older release, re-add the marketplace at that tag. Claude Code registers one marketplace per name,
so remove the current one first. Removing it uninstalls the plugin, but your learning data stays:
it is stored outside the plugin.

```bash
claude plugin marketplace remove learning-mentor-marketplace
```

```bash
claude plugin marketplace add kornegy/learn_AI_plugin-Claude-@v1.0.0
```

```bash
claude plugin install learning-mentor@learning-mentor-marketplace
```

That works only if the older release understands your data schema. All releases so far do
(schema 1). To return to the latest version, repeat the steps without `@<tag>`.

## What changed between versions

The [changelog](../CHANGELOG.md) has the full list. Changes that affect upgrades:

| Version | Data schema | What to know |
|---|---|---|
| 1.0.0 | 1 | No data changes. The shipped server code is now readable (not minified) and split into shared files under `server/dist/chunks/`. Commands explain a missing Node.js |
| 0.9.0 | 1 | Adds a derived cache, `.mentor/cache/frontmatter.json`. It is safe to delete and is never exported. Files with names that aren't kebab-case are ignored (doctor counts them). The filesystem root and the home folder are refused as learning workspaces |
| 0.2.0 | 1 | New journal event `session_logged` (older readers ignore it). New tools: insights, progress, log_session |
| 0.1.0 | 1 | First release |

## Troubleshooting after an update

| Symptom | Fix |
|---|---|
| The mentor says its local server isn't running | Install Node.js 20 or later and make sure `node` is on your `PATH`, then restart Claude Code. Check with `node --version` |
| `/plugin` shows the old version | Run the marketplace update in step 1, then update again |
| `E_SCHEMA_TOO_NEW` | You are running an older plugin on newer data. Update the plugin |
| A file is reported as damaged | Ask the mentor to repair it. `mentor_doctor` moves the file to quarantine and rebuilds it from the journal |
