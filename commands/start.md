---
description: Start with Learning Mentor — set up your learning profile and workspace, or add a new subject
argument-hint: "[subject or goal]"
---

Run Learning Mentor onboarding. Arguments: $ARGUMENTS

1. In at most 3 short lines, tell the learner what you will store (learning goals, per-topic
   levels with evidence, plans, research notes), where (a local folder, `~/LearningMentor` by
   default), and that the plugin sends nothing anywhere.
2. Call `mentor_init` with `workspace_path` = the current working folder (confirm it with the
   learner first, or use the folder they name) and `language` = the language the learner writes
   in. If it says `already_initialized`, skip to step 4 for a new subject, or show
   `/learning-mentor:status`.
3. Ask these questions **one at a time**. The learner may answer "skip" to any of them:
   1. What do you want to learn, and why? (goal)
   2. What do you already know about it? → record `self_report` evidence later on the relevant
      topics, as provisional levels.
   3. How do you like explanations: analogies first, examples first, or concepts first? →
      `mentor_settings` `explanation_style`
   4. Which language should I explain in? (default: the language you write in) → `mentor_settings`
      `language`
   Save goals and background with `mentor_update_profile` (target `profile`).
4. Draft a subject path of 3–8 topics with prerequisites and call `mentor_plan_path` with
   `create_missing: true`. Show it in a few lines: "We'll start with X, because Y."
5. Ask: "Ready to start with X?" If yes, follow the `mentor` skill (new topic protocol).

If the `mentor_*` tools are unavailable, say that the plugin's local server is not running (it needs
Node.js 20 or later on the PATH; see the plugin's README). Don't search the disk for learner files.
