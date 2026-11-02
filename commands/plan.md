---
description: Show or change your learning plan for a subject or topic
argument-hint: "[subject or topic id]"
---

Show or edit the learning plan. Arguments: $ARGUMENTS

- **Subject** (e.g. `cpp`): read `mentor_get_context` with `subject`, show the path order with
  each topic's level and whether it is available or blocked by prerequisites. If the learner wants
  changes (add or remove topics, change the order or goal), call `mentor_plan_path` with
  `mode: "merge"` (or `"create"` to rebuild).
- **Topic** (e.g. `cpp/pointers`): read `mentor_get_topic`, show its stages with status. To change
  upcoming stages, call `mentor_plan_topic` with `mode: "replace_pending"`; to add a
  reinforcement stage, use `mode: "insert"`. Completed stages cannot be changed.
- **Nothing given**: use `mentor_next` and show the plan for the most active subject.

Keep the output short. Confirm changes before writing them.

If the `mentor_*` tools are unavailable, say that the plugin's local server is not running (it needs
Node.js 20 or later on the PATH; see the plugin's README). Don't search the disk for learner files.
