---
name: coordinating-builder-sessions
category: orchestration
description: Use when briefing or checking parallel builder sessions.
---

# Coordinating builder sessions: brief every decision, assign shared numbers, verify before reporting

Every brief repeats the process decisions the user has already made, in the brief's own words. Before changing a review, test or merge step, reread the handoff note and the decision records. Never trim an agreed round (a second review pass, the full test run) to save time unless the user says so. Speed is not a reason to drop an agreed step.

## Briefs
- Name the exact commands to run and the exact items to report back: commit SHA, pass counts, file names.
- Ask for one push per fix round, not several.
- Shared numbers are yours to assign up front: migration slots and spec IDs. When a builder renumbers anything, check it against every open pull request, not only main.

## Checking the result
- A builder's "all checks pass locally" is a claim to verify. Read the pushed branch and its check runs yourself before reporting.
- Report to the user only what you saw, with the SHA it applies to.
- A fix that touches merged work or reshuffles the plan goes back to the user in a few lines before the builder starts.
