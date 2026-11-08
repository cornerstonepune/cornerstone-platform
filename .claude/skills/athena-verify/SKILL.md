---
name: athena-verify
model: opus
description: Use after a scoped change's proofs pass and before shipping. A different model, read-only, checks the change against the locked scope for unmet criteria, unasked work and missing promises.
---

# athena-verify: an independent second opinion

1. Run `python3 .claude/athena/bin/athena done <ID>` and keep the output.
2. Get the base branch, usually `main`, and run `git diff --stat <base>...HEAD -- . ':!specs'`. Then run the scope-creep check (offline, read-only): `python3 .claude/skills/scope-creep-detector/scripts/scope_creep.py --repo . --base <base> --intent "<the spec's title>" --json`, and keep its JSON.
3. **Dispatch the `athena-verifier` agent.** Give it the spec path, the base branch, the `athena done` output and the scope-creep JSON (files it lists as `likely_creep` need a reason from the spec, or they are unasked work). Don't give it your own opinion of the work.
   If the change alters an existing harness component (plugin, skill, hook or agent), also give it the component's `athena scorecard` row and tell it to answer FAIL unless a proof shows that component fired in a recorded session; for a gate or schedule, its CI or routine run record is that proof. A newly added component cannot have fired yet: verify it by its proofs and note that its first fire is pending (`athena health` flags it if it never fires).
   If the repository has `requirements/harness.md`, run `python3 .claude/athena/bin/athena requirements` and give the agent the list too; it must answer MET or NOT MET for each line the change names, and FAIL if any is NOT MET.
4. Save its answer verbatim to `specs/<ID>/VERIFY.md`.
5. **If the verdict is FAIL:**
   - Remove unasked work, or add what is missing, then run steps 1–4 once more.
   - If it still fails, or the disagreement is about what the scope means, run `athena block <ID> "<reason>"` and stop.
6. **If the verdict is PASS,** run `python3 .claude/athena/bin/athena finish <ID>`. `athena-ship` then merges the pull request itself if every merge condition holds; the PASS in `VERIFY.md` is one of them.
