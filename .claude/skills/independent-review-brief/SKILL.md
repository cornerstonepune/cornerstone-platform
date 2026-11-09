---
name: independent-review-brief
category: verification
description: Use when briefing an independent reviewer or audit agent.
---

# Independent review brief: a fresh reader, read-only, evidence per claim, scored output

Write the brief so the reviewer judges the work without the history of how it was built. Include, in this order:

1. **Ground rules:** read-only; no edits, commits, pushes, comments or database writes; no personal data or secrets printed or copied.
2. **Reading order:** the authoritative documents first, and say which one wins when two disagree.
3. **Decisions already made:** list them so the reviewer may note a cost once, plainly, but may not reopen them.
4. **Evidence rule:** every claim carries a file and line or a commit. "I am not certain" is allowed. No invented names.
5. **Output:** a score per named area, and for each finding its evidence, why it matters, the smallest fix, and when to fix it (now, with the piece in progress, as its own change, or later). End with what the reviewer did not read.

When the report comes back, sort findings before acting. Fixes that fit work already under way go with it; fixes that undo merged work or reshuffle the plan go to the user first.
