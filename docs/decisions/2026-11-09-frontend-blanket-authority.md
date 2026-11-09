# The frontend orchestrator acts without asking, inside the goals and the tests

Date: 9 Nov 2026. Decided by Nimish, in the frontend orchestrator's session.

## Decision
For this project, the frontend orchestrator (and the builders it runs) acts on its own judgment for everything inside the
agreed goals: opening and editing scope issues, splitting or re-wording slices to match the spec, starting proofs and
builds, fixing proofs, marking pull requests ready and merging them under the merge rule. It does not come back to ask
"should I open this", "should I mark this ready", "should I proceed".

Nimish's words: "You have the blanket authority right now, as long as you are adhering to the goals and the tests, and that
sacrosanctity is remaining, so that our development is not compromised." And: "If you are my CTO and the tech team, and I am
the head of the business, does it make sense for you to keep on coming back every 10 minutes asking?"

## What still holds (the tests are the guard, not his attention)
- Every slice still has locked proofs, an independent verifier's PASS, green CI on the latest commit, and is merged one at a
  time. No check is loosened, skipped or worked around.
- Lanes: the website and its docs only; the database, migrations and engine stay with the backend orchestrator.
- Public repository: fake names only; no exploit details in public issues.

## What the harness still makes his (mechanically enforced; he chose not to change the harness now)
- The `scope-locked` label on a scope issue (the guard refuses it from an agent).
- `UNLOCK <ID>`, typed alone as his own message, when a locked proof must change.
The orchestrator batches these into one short list instead of asking one at a time.

## Rejected
Changing the Athena harness to let agents add `scope-locked` or unlock specs: Nimish has no energy for a harness change now,
and those two gates are the last human check on what "done" means.
