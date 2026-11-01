# Classifying evidence

The server turns evidence into levels (1 New to me · 2 Needs reinforcement · 3 Partial
understanding · 4 Solid). Your job is an honest classification of what the learner just showed.

## Kind

| kind | The learner… | Example |
|---|---|---|
| `exposure` | only read or heard an explanation | You explained dereferencing; no answer yet |
| `self_report` | claims a level (`reported_level` 1–4) | "I know loops well" → probe it soon |
| `recognition` | picked a correct option, said yes/no | Chose b) in a multiple-choice question |
| `recall` | stated a fact or definition unaided | "`&x` gives the address of x" |
| `explanation` | explained the idea or *why* in their own words | "A pointer is a variable whose value is an address; `*p` follows it" |
| `application` | solved a task, wrote working code, predicted output correctly with reasoning | Wrote `swap(int* a, int* b)` that works |
| `transfer` | applied it in a new context, found and explained a bug, compared approaches, taught it | Spotted a dangling pointer in unfamiliar code and explained why |

When in doubt, pick the **lower** kind. Restating your words is `recall`, not `explanation`.

## Outcome

- `success`: correct and complete for what was asked.
- `partial`: right idea with a real gap, or right result with wrong reasoning. (A partial
  application counts as assisted success; a partial explanation counts as a failure.)
- `fail`: wrong, or "I don't know".

## Independence

- `independent`: no hints for this answer.
- `assisted` + `hint_level`: highest rung of the assistance ladder used (1 concept hint,
  2 co-written plan, 3 syntax example, 4 analogous worked example, 5 bug location).

## Context

- `learning`: during normal teaching.
- `review`: a spaced-review check of a topic learned earlier (from due reviews).
- `diagnostic`: checking prerequisites or placement, exam mode.

## Misconceptions vs slips

- **Slip**: a one-off error (typo, off-by-one under time pressure). No misconception field.
- **Misconception**: a stable wrong belief, seen twice or clearly reasoned from a wrong model
  ("the pointer stores the value"). Add `misconception: {id, description}`. Reuse ids across
  topics (`addr-vs-value`, `array-is-pointer`, `join-filters-rows`).
- When a later correct answer shows the belief is fixed, add `addresses: [id]`.

## Worked examples

- Learner after your explanation: "OK, got it." → nothing, or one `exposure`. "Got it" is not
  evidence.
- "So a pointer is like a sticky note with a flat number, and `*` means go to that flat." Correct
  → `explanation` · `success` · `independent`.
- Wrote the function after you suggested "think about what you pass: values or addresses?" →
  `application` · `success` · `assisted` · `hint_level: 1`.
- In review, couldn't recall what `&` does, then got it after a hint → `recall` · `fail` ·
  `review`, then `recall` · `success` · `assisted` · `hint_level: 1` · `review`.
- Twice wrote `*p = &x` meaning "store the address" → `application` · `fail` ·
  `misconception: {id: "deref-vs-address", description: "Uses *p where p itself should be assigned"}`.
