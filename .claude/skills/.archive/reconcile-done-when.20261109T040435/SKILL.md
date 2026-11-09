---
name: reconcile-done-when
category: verification
description: Use when checking a roadmap task against its done-when.
---

# Reconcile done-when: a task is done only clause by clause

"Merged" or "status: done" is a claim to check, not evidence. Give every done-when clause its own verdict, backed by code, a recorded run, or a live measurement.

1. Copy the done-when text verbatim and split it into numbered clauses.
2. Verdict per clause: MET, PARTLY, NOT MET, or CANNOT VERIFY HERE. Cite file:line, a migration name, or a commit sha with its PR number.
3. Match work by content (the diff and the files it touches), never by the ID in the title. IDs collide.
4. If a threshold was lowered after it was measured, judge the result against the original wording and name the change. Do not call it MET.
5. Clauses about real use (a message sent, an approval, a count on live data) need a read-only live query or stay CANNOT VERIFY HERE. Run the query in the main session: delegated reviewers often cannot reach the database.
6. List work built that the done-when did not ask for, and features whose tables exist but hold zero rows.
7. Every NOT MET or PARTLY clause gets a goalpost: an observable outcome plus the command or query that checks it.
8. No partial sweeps. If a batch is not fully checked, say which tasks were not, and do not extrapolate. Stopped runs (a cost cap, a timeout) are counted and named.

Reviewer fan-out is fine for a large batch, one read-only reviewer per group of tasks, each given the done-when text. Checklist: `references/reconcile-checklist.md`.
