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
