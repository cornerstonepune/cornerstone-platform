---
name: coordinating-builder-sessions
category: orchestration
description: Use when briefing, checking, messaging or archiving parallel builder sessions, or when an independent verifier returns FAIL on a builder's work.
---

# Coordinating builder sessions: brief every decision, assign shared numbers, verify before reporting

Every brief repeats the process decisions the user has already made, in the brief's own words. Before changing a review, test or merge step, reread the handoff note and the decision records. Never trim an agreed round (a second review pass, the full test run) to save time unless the user says so. Speed is not a reason to drop an agreed step.

## Briefs
- Name the exact commands to run and the exact items to report back: commit SHA, pass counts, file names.
- Ask for one push per fix round, not several.
- Shared numbers are yours to assign up front: migration slots and spec IDs. When a builder renumbers anything, check it against every open pull request, not only main.
- When a verifier flags a class of bug (wrong identity column, wrong clock, missing function search_path), put the cause and the helper to reuse in every later brief, and say which existing function to copy (for example the sign-in-to-staff resolver), so the next builder does not repeat it.
- Tell builders to test with ids that differ. A fixture that gives two identifiers the same value hides a mismatch, and all tests pass while the feature is broken.
- A message that returns "not found" means the session is gone or was never reachable. Check it with get-session; if it is gone, recreate it with the full brief and tell the user which one was replaced.
- Commands that name a locked spec path together with a copy, move or remove word are refused by the guard. Brief builders to copy a locked spec with a single git show per file.

## Checking the result
- A builder's "all checks pass locally" is a claim to verify. Read the pushed branch and its check runs yourself before reporting.
- Report to the user only what you saw, with the SHA it applies to.
- A fix that touches merged work or reshuffles the plan goes back to the user in a few lines before the builder starts.
- A verifier FAIL goes back to the same builder as one numbered fix list with the cause of each item. After the builder pushes, a fresh verifier runs on the new SHA. Never report PASS from the earlier verdict.
- Before archiving sessions, list them all and archive only the ones whose work is finished and that this orchestrator started. Leave sessions the user started alone, and tell the user the list of what was archived and what was left.
- Each stop-hook reminder about untracked files is answered once, in one line: the autoharness and plugin-written skill folders are never committed. Do not restate it on every stop.
- A builder's report to the orchestrator carries the head SHA, the `athena done` result per spec, the checks that only run on the production box (named as not run), and the steps only Nimish can take (labels, the draft pull request). The builder never writes a VERIFY.md; the orchestrator adds it.
