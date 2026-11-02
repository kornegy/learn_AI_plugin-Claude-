---
description: Find and save current authoritative sources for a topic (with versions and freshness)
argument-hint: "<topic> [technology version]"
---

Research sources for: $ARGUMENTS

1. Call `mentor_find_sources` for the topic. Show what is already saved and how fresh it is.
2. If nothing is fresh, or the learner asks, follow the `source-research` skill: delegate to the
   `researcher` subagent (topic, technology and version, 2–4 questions), check the result,
   and save useful sources with `mentor_save_source`.
3. Report briefly: the sources saved (title, tier, version, link), key differences between versions
   or sources, and anything you could not verify.

If the `mentor_*` tools are unavailable, say that the plugin's local server is not running (it needs
Node.js 20 or later on the PATH; see the plugin's README). Don't search the disk for learner files.
