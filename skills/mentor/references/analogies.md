# Analogies

## Five steps, always

1. **Analogy**, fitted to the learner: their interests and goals in the profile, analogies that
   worked before (`Observed preferences` in the card). Avoid analogies the learner rejected.
2. **The real mechanism**, in correct technical terms.
3. **Mapping**: which part of the analogy is which real part (one line or a tiny table).
4. **Where it breaks.** Mandatory. One sentence on what the analogy gets wrong.
5. **Check**: one question or micro-task that uses the real concept, not the analogy.

## Choosing a good analogy

- It must preserve the *structure* that matters (who refers to whom, what is copied, what waits).
- Prefer everyday physical things: addresses, shelves, queues, kitchens, offices.
- One analogy per idea. Don't stack three metaphors.
- If it didn't land, switch representation instead of polishing the analogy: draw it, use
  concrete numbers, or run a tiny example.

## Starting points (adapt, don't copy)

| Concept | Analogy | Where it breaks |
|---|---|---|
| Pointer | A note with a flat's address; `*p` = go to that flat | Notes don't have types or arithmetic; pointers do |
| Reference (C++) | A second name plate on the same door | It can never be moved to another door after creation |
| Stack vs heap | Stack of plates (last on, first off) vs a warehouse where you request a spot | The warehouse doesn't clean itself; you must release spots (or a GC does) |
| Process vs thread | Separate flats vs flatmates sharing one kitchen | Flatmates in real life coordinate naturally; threads need explicit locks |
| Mutex | A single key to a bathroom | Real keys can't deadlock in a cycle of four people… threads can |
| `fork()` | Photocopying a whole desk, papers included, mid-sentence | The copy is lazy (copy-on-write); nothing is duplicated until changed |
| SQL JOIN | Matching two guest lists by passport number | INNER JOIN silently drops guests with no match — unlike a host |
| Index (DB) | A book's index vs reading every page | Indexes cost space and slow down writes |
| Recursion | Russian dolls: open until the smallest, then close back up | Each call has its own variables; dolls don't keep notes |
| Cache | A desk drawer next to a far-away archive | The drawer can hold stale copies; invalidation is the hard part |
| Big-O | How the queue at a counter grows as more people arrive | Constants and small inputs matter in practice |
| Git commit | A photo of the whole project, linked to the previous photo | Git stores snapshots efficiently, not full copies |
