# QA report: v0.9.0 (release candidate)

Phase 5 deliverable, 2026-11-02. Scope: ARCHITECTURE §12 (threat model), DATA_FORMAT §11
(compatibility), PRODUCT_SPEC §10 (behaviour), and the ТЗ requirement to check security and
robustness.

## Summary

| Area | Method | Result |
|---|---|---|
| Security | Manual review against the threat model, plus an independent automated security review of the whole branch | 6 issues found and fixed, each with a regression test; the independent review found no further high-confidence issues |
| Data integrity | Seeded fuzzing of the document format (≈ 36,000 cases over 12 seeds) and ~500 random or hostile calls across all 21 tools | 3 round-trip bugs found and fixed; no internal errors; data stays healthy |
| Engine correctness | Property tests on random evidence: determinism, order independence, exposure never changes the level, strictness is monotone, one later slip never lowers a level, misconception counts | All hold |
| Performance | `server/scripts/perf.ts` on a 500-topic / 10,000-event learner | Hot spots fixed (doctor 50 s → 2.2 s; hook ≈ 280 ms at 150 topics) |
| Compatibility | v0.1.0 data frozen as a fixture | Reads, passes doctor without repairs, accepts writes, keeps unknown fields |
| Cross-platform | CI on Ubuntu (Node 20, 22), macOS and Windows (Node 22) | Green; one Windows-only issue (CRLF) found and fixed in Phase 4 |
| Behaviour | 15 eval cases × 3 runs, with a no-plugin baseline | See [EVAL_REPORT.md](EVAL_REPORT.md) |

Automated tests: **194** (unit, integration, hook, bundle, architecture, fuzz, compatibility).

## Security findings (all fixed)

| # | Finding | Impact | Fix | Test |
|---|---|---|---|---|
| S1 | Learner or model text containing `<!-- mentor:end -->` or `<!-- mentor:section … -->` on its own line was written into a managed section | The next read failed with `E_CORRUPT`: the learner's own text could make a topic file unreadable | Markers inside content are neutralised before writing | `security.test.ts` S1 |
| S2 | Taking over a stale lock used `rm` and then create | With 3+ racing processes and a crashed holder, two writers could end up holding the lock | Atomic rename of the stale file plus a content check; a fresh lock moved by mistake is restored with an atomic `link` | S2 (8 contenders) |
| S3 | Any `*.md` file in data folders was read, and its name was echoed in "data problem" lines of the card | A file named like an instruction would land in the model's context | Only kebab-case names are read; doctor counts the others without naming them | S3 |
| S4 | The secret filter did not cover topic titles in `mentor_plan_path` or aliases | A credential pasted as a title would be stored | Both are filtered | S4 |
| S5 | The filesystem root or the home folder could be registered as a learning workspace, or used as the data root | Mentor mode would apply to every project, against ADR-005 | Rejected; `workspace_path` must be absolute | S5 |
| S6 | Journal files were read in full regardless of size | A damaged multi-GB file would exhaust memory at every session start | Files over 64 MB are skipped and reported by doctor | S6 |

Checked and found safe:
- YAML parsing (`yaml` 2.x, core schema): alias bombs are rejected, custom tags are not executed,
  and `__proto__` keys don't pollute prototypes.
- Path handling: every file path is built from validated ids and checked to stay in the root.
- Symlinks: skipped in listings and exports, never followed for writes.
- Delete tokens: random, bound to their arguments, expire after 10 minutes.
- No network or process-spawning code in the server.

Out of scope, accepted:
- Prompt injection through saved sources or learner text is mitigated (quoted data in the card,
  a read-only research subagent, skill rules, eval case 15) but cannot be ruled out, because the
  model reads that text.
- Races that need an attacker who can already write to the user's home folder.

## Bugs found by fuzzing (all fixed)

| Bug | Effect | Fix |
|---|---|---|
| CR/CRLF inside section text | The file changed on every rewrite, because the parser reads CRLF as LF | Line endings in section content are normalised |
| Frontmatter values ending in newlines | The serialiser trimmed all trailing newlines and the parser dropped the last one, so values changed | Exactly one newline is removed, and the parser keeps the newline that belongs to the value |
| Multi-line values made only of whitespace | YAML block scalars altered them | Multi-line strings are written double-quoted |

## Performance

`node scripts/run-ts.mjs scripts/perf.ts <dir> 500 20` (500 topics, 10,000 evidence events,
Linux container, Node 22):

| Operation | Before | After |
|---|---|---|
| doctor repair (rebuild all topics) | 49,952 ms | 2,208 ms |
| next | 568 ms | 76 ms |
| find_topics | 519 ms | 89 ms |
| insights | 855 ms | 331 ms |
| record_evidence | 178 ms | 161 ms |
| SessionStart hook, 150 topics / 3,000 events (warm) | ≈ 500 ms | ≈ 280 ms |
| SessionStart hook, 500 topics / 10,000 events (warm) | — | ≈ 450 ms |

Changes:
- A one-pass `JournalIndex` replaces scanning every event for each topic.
- A derived frontmatter cache in `.mentor/cache/frontmatter.json`, keyed by inode, size and
  mtime. It is excluded from exports and dropped on every deletion.

The first call after many file changes rebuilds the cache, about 1 s at 500 topics.

## Known limitations at v0.9.0

- **Cowork is not verified (spike S2).** Needs Claude Desktop on the owner's machine.
- **No `.mcpb` bundle for Claude Desktop chat (S3).** Chat gets the methodology without memory.
- **Model-dependent behaviour.** Instructions are not guarantees; see the eval known gaps (a
  two-part question in an opening, a stage plan occasionally skipped).
- **The beta with real learners is still to come.** It is the owner's decision; feedback goes
  through the issue templates (no telemetry).

## How to reproduce

```bash
cd server && npm ci && npm run check
```

```bash
for s in 1 2 3 31337; do FUZZ_SEED=$s npx vitest run tests/unit/fuzz.test.ts; done
```

```bash
node scripts/run-ts.mjs scripts/perf.ts /tmp/lm-perf 500 20
```
