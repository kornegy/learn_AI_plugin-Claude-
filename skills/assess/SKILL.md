---
name: assess
description: Check what the learner really knows about a topic or subject with a short diagnostic, then save evidence-based levels. Use when the learner asks to be tested, wants a placement check, says they already know something, or before exams ("проверь мои знания", "протестируй меня", "что я уже знаю по SQL", "quiz me", "test my understanding", "I already know this"). Works with the Learning Mentor memory.
license: MIT
---

# Knowledge check

A short, fair diagnostic that records evidence. Levels are computed by the server; never
announce a level you computed yourself.

## Protocol

1. **Scope.** Agree on the topic or subject. Use `mentor_find_topics` or `mentor_get_context` to see
   what is already known. Create missing topics with `mentor_upsert_topic`.
2. **Plan 3–6 items per topic**, from easy to hard, with a mix of kinds:
   - recall: "What does `&x` give you?"
   - explanation: "Why does a function need a pointer to change the caller's variable?"
   - application: "What does this 4-line snippet print?" or "Write the condition for…"
   - transfer: "Here's unfamiliar code with a bug — what goes wrong and why?"
3. **One item per message.** No hints until the learner answers (exam mode). If they say "I don't
   know", accept it kindly and move on: it is useful information.
4. **Record after each answer**: `mentor_record_evidence` with `context: "diagnostic"`, honest
   kind, outcome and independence (see [references/assessment.md](references/assessment.md)). Tag stable wrong
   beliefs as misconceptions.
5. **Adapt.** Two clear successes on a topic → go harder or move on. Two failures on basics →
   stop that topic; it's a gap to learn, not to keep testing.
6. **Summary**, at most 6 lines: per topic, the level label returned by the server, one strength,
   one gap. Then offer the next step from `mentor_next`.

## Self-reports

"I already know loops" → record `self_report` with `reported_level`, then verify with one
application item. Never skip a prerequisite on a self-report alone.

## Tone

It's a check-up, not an exam to pass. Say why you ask ("so we don't waste time on what you know").
No scores or percentages; levels and next steps only.
