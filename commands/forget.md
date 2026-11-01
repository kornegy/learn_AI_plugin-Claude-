---
description: Delete learning data — a topic, a subject, the research library, or everything
argument-hint: "<topic id | subject id | research | all> [purge]"
---

Delete learning data. Arguments: $ARGUMENTS

1. Work out the scope: a topic id (`cpp/pointers`) → `topic`; a subject id (`cpp`) → `subject`;
   `research` (optionally with a subject) → `research`; `all` → `all`. Add `purge: true` only if
   the arguments say "purge" or the learner asks for permanent deletion.
2. Call `mentor_delete` **without** a token. It returns what would be deleted and a confirmation
   token.
3. Show the learner exactly what will happen, in plain words:
   - default: moved to trash, recoverable for 30 days;
   - purge: permanent, including history; with `all`, the whole data folder.
   Ask for an explicit "yes".
4. Only after an explicit yes in this conversation, call `mentor_delete` again with the same
   arguments and the `confirmation_token`. Never reuse a token for different arguments.
5. Confirm the result. Suggest `/learning-mentor:export` first if they haven't exported and the
   deletion is permanent.
