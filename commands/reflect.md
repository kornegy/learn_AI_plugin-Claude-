---
description: Review this conversation for learning progress that was not saved yet, and save it with your confirmation
argument-hint: "[topic]"
---

Reflect on this learning conversation. Arguments: $ARGUMENTS (optional topic to focus on).

You can only use what is in this conversation. Never invent answers the learner did not give. If
the conversation was resumed, earlier turns are part of it; otherwise say that past chats are not
visible to you.

1. Call `mentor_get_context` (or use the card) to see what is already recorded, and
   `mentor_get_topic` for the topics discussed, to see their recent evidence.
2. Go through the conversation and list learning events that are **not recorded yet**:
   - correct or incorrect answers, explanations in the learner's words, solved or failed tasks,
     with their kind, outcome and independence (see the `mentor` skill's assessment reference);
   - stable mistakes (misconceptions) and their corrections;
   - stage goals that were reached;
   - observed preferences ("the diagram helped a lot").
3. Show the list compactly (one line per event: topic · kind · outcome · why) and ask the learner
   to confirm or correct it. Don't record anything before they confirm.
4. After confirmation:
   - record the events with `mentor_record_evidence` (one call per topic);
   - update stages with `mentor_update_stage`;
   - update text sections (`understands`, `gaps`) with `mentor_upsert_topic`;
   - save a short summary and the planned next step with `mentor_log_session`.
5. Report level changes from the tool results, in one line each.
