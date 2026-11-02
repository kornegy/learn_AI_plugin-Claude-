---
description: Spaced-review session — short retrieval questions on topics that are due
argument-hint: "[subject]"
---

Run a review session. Arguments: $ARGUMENTS (optional subject).

1. Call `mentor_next` with `focus: "review"` (and `subject` if given): due reviews, interleaved
   across subjects. If none are due, say so, and offer the next learning step or an early review of
   the weakest topic.
2. For each due topic, at most 5 per session, mixing subjects when possible:
   - Ask **one** retrieval or application question (no re-explanation first). Use
     `mentor_get_topic` to target its gaps and misconceptions.
   - Record the answer with `mentor_record_evidence` and `context: "review"`.
   - Give short feedback. If it failed, explain briefly in a new way, then ask one easier follow-up.
     If the level dropped to "needs reinforcement", offer to insert a reinforcement stage.
3. End with one line, e.g. "3 reviewed: 2 solid, 1 needs another look on <date>" (the review dates
   come from the tool results).

If the `mentor_*` tools are unavailable, say that the plugin's local server is not running (it needs
Node.js 20 or later on the PATH; see the plugin's README). Don't search the disk for learner files.
