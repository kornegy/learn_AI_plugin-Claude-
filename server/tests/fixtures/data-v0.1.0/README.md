# Learning Mentor data

This folder holds your learning profile, written by the Learning Mentor plugin for Claude.
Everything here is plain text that you can read, back up or put under version control.

- `learner-profile/` — goals, preferences, per-subject overview
- `knowledge-base/` — one file per topic: level, what you understand, evidence
- `learning-paths/` — your plan per subject and per topic (stages)
- `research-library/` — notes on sources with links and freshness
- `.mentor/` — settings, the append-only journal, backups, trash

Sections between `<!-- mentor:section … -->` markers are maintained by the plugin; sections
marked as server-rendered (status, mistakes, evidence, levels, overview) are regenerated on
every update. You can write your own notes anywhere outside the markers.

Nothing in this folder is sent anywhere by the plugin.
