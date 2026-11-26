# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 (session 5, end) · **By:** Plan (Opus) · **Model:** claude-opus-5-5
**Milestone:** M6 K1 pilot · **Branch:** plan/mapping-explorer

## State
- Nimish, 25 Nov: a blank birthday cell on the class list enrols the child with birthday NULL (ADR 0112). Why: the Gurukul K1 list (21 children) has no birthdays.
- **#946** (size:small): blank birthday → NULL, written-but-bad still refuses, `_same_person` never mismatches on a blank, grade-neutral age words. Seed `plan/t946` pushed with failing visible tests (tests/test_enrol_blank_birthday.py + one wording line in test_people.py) and hidden tests (tests/holdout/test_enrol_blank_birthday_hidden.py). No seed/schema change: the shared test DB works.
- #942 and #939 (#945) are merged on main.

## Next step
0. Mapping explorer (Nimish's side ask, a read-only Artifact, not a ticket): page WRITTEN, not checked or published. Source + exact finish steps: docs/loop/notes/mapping-explorer.md ("State" section). New bad news for Nimish: no objective reaches "kind" (all 7 kind groups empty); 16 of 24 groups empty; all Science + Global perspectives objectives map to "Changing my mind", which looks wrong.
0b. Profile mapping (G1-G4): ADR 0114 ACCEPTED with all four answers (every group an objective's skills reach; Nimish
    approves each proposal; skill-less objectives keep their machine group until skilled, goal = none skill-less; gold set
    drafted from "I can" lines, Nimish corrects). Facts in docs/loop/notes/mapping-explorer.md "Verified": 244 skills all
    reach a capability via the spine, none a group (37 decided, 207 need a pick); 282 G1-G4 objectives have no skill.
    NEXT: `loop plan` from ADR 0114 -> tickets: (1) migration dropping objective_statement_one_capability + per-class
    check command; (2) skill->group proposal prompt + gold + `engine eval`; (3) proposals-queue kind writing source='person'
    rows; (4) skill proposals for the 282. Don't touch PR #952 / plan/k1-pilot-offers (it owns ADR 0113).
1. `loop run-ticket 946` → CI → reviewer → merge.
2. Then the Gurukul K1 enrol: dry run first, Nimish runs --apply (list is outside git under ~/cornerstone/private/; never copy names).
3. Queued small ticket: people.py "engine enrol k2" dry-run label and stale "enrol k2" docstrings (people.py:1, signer.py:3, roster.py:130, tests/rows.py). #946 deliberately leaves the label alone.
4. ADR 0108 ticket 4 (form mark → activity_observation + evidence_event, G6.4) via loop plan.
- Open question for Nimish: holiday cells (e.g. "Block Room") make no plan lines today; keep or drop them?

## Don't repeat
- A ticket that changes a seed needs a test DB built from its seed branch (bin/testdb fresh …/t<N>) and TEST_DATABASE_URL passed to loop build/finish.
- Builders run `dontAsk`: one simple command per call, single-line `git commit -m`, no Blocked section left in their handoff.
- Seed cut from another seed branch conflicts once that ticket squash-merges: cherry-pick onto main. After any merge to main: `gh pr update-branch` + `loop ci` before `gh pr merge`.
