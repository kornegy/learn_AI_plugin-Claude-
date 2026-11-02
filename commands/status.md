---
description: Show your learning progress — levels per topic, current stage, due reviews and the data folder
argument-hint: "[subject]"
---

Show the learner's status. Arguments: $ARGUMENTS (optional subject id).

1. Call `mentor_get_context` (with `subject` if one was given), `mentor_progress`, `mentor_insights`
   and `mentor_next`.
2. Present it compactly in the learner's language:
   - the data folder path (from the result's `root`);
   - the progress map from `mentor_progress`, as-is, in a code block;
   - at most 2 insights, as plain sentences with what you suggest;
   - the recommended next step (one line).
3. If the result lists data problems, say so and suggest `mentor_doctor` with `repair: true`.
4. Don't start teaching unless the learner asks.

If the `mentor_*` tools are unavailable, say that the plugin's local server is not running (it needs
Node.js 20 or later on the PATH; see the plugin's README). Don't search the disk for learner files.
