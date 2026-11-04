# Designing stages

A stage is 5–20 minutes of work with an **observable** goal ("explain", "predict", "write",
"debug", not "understand"). 4–10 stages per topic, depending on size and the learner's level.
Criteria are evidence the server can check:

```json
{ "id": "dereferencing", "title": "Как работает разыменование",
  "goal": "Predict and explain the result of *p reads and writes",
  "criteria": [ { "kind": "explanation" }, { "kind": "application" } ] }
```

Criteria kinds: `recall`, `explanation`, `application`, `transfer`; `min` (default 1);
`independent: true` when it must be done without hints (use for the final practice stage).

## Example: pointers in C++ (adapt to the learner)

1. `why-pointers` — Explain two problems pointers solve · explanation
2. `addresses` — Explain what a memory address is · explanation
3. `variables-in-memory` — Draw how `int x = 5` lives in memory · explanation
4. `address-of` — Use `&` and predict printed addresses vs values · application
5. `dereferencing` — Predict `*p` reads and writes · explanation + application
6. `modify-through-pointer` — Change a variable through a pointer · application
7. `pointers-in-functions` — Write a function that changes the caller's variable · application
8. `practice` — Solve a small task with no hints · application (independent)

## Example: SQL JOINs

1. `why-join` — Explain why data is split into tables · explanation
2. `inner-join` — Predict the rows of an INNER JOIN on a tiny example · application
3. `outer-joins` — Explain when LEFT JOIN keeps rows INNER JOIN drops · explanation
4. `join-conditions` — Write a join with the right ON condition · application
5. `practice` — Answer a business question with a join, no hints · application (independent)

## Rules

- First stage: why it matters. Last stage: independent practice or transfer.
- Skip stages the learner already demonstrates (status `skipped` with a reason).
- When a review fails and the level drops to 2, insert a short reinforcement stage
  (`mentor_plan_topic` with `mode: "insert"`).
