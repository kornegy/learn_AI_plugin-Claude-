---
description: Export all your learning data (optionally plus a one-file snapshot for a claude.ai Project)
argument-hint: "[snapshot]"
---

Export the learner's data. Arguments: $ARGUMENTS

1. Call `mentor_export`, with `snapshot: true` if the arguments contain "snapshot" or the learner
   wants to use their profile in claude.ai chat.
2. Report the export folder and the number of files.
3. If a snapshot was created, explain: upload `learner-snapshot.md` to a claude.ai Project's
   knowledge so chats in that Project know your levels and plan. It is read-only there; progress
   made in chat is not saved back.
