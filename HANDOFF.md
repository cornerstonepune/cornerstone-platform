# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-24 · **By:** Coordinator (loop:run, side session) · **Model:** claude-opus-5-5
**Milestone:** M6 K1 pilot · **Branch:** plan/coord-handoff · stopped at 150k context

## State
- **#942 MERGED and LIVE** (f9f33aea4): main CI, migrate live and deploy engine all green. Read back on live with read-only SQL: migration 20270217090000 is recorded; all 16 F.N 10 rows (14 ACT-K1 + ACT-K2-0449 + ACT-K2-M0018) have 4/4 level words; both K2 rows have also_bands [K1]; ACT-K1-F001..F006 exist with 4/4 words (deploy engine's `engine load` loaded them). G6.6 is NOT ticked in PROJECT.md yet (a plan-only file: tick it in the next loop plan job).
- **#939**: #943's second failure was NOT a missing CLI option. The older #934 hidden test (tests/holdout/test_enrol_grade_hidden.py) enrolled K1 with no --campus, and the #939 seed (K1 at Gurukul and Neev) correctly refuses that. The first failure: a dry run with a missing school year stopped before printing "would add the class". `loop plan` fixed the ticket body and plan/t939 (that test now passes --campus Gurukul), removed the escalation and closed #943. The fresh build (attempt 1) passed 51 enrol/people tests locally. `loop finish 939` was RUNNING at session end, with the test DB `t939` on port 54329 built fresh from plan/t939. Next: find the t939 PR (`gh pr list`), `loop ci <pr>`, reviewer, merge, `loop clean 939`, drop DB t939.
- Children CSV (outside git): 21 rows, columns number,name,birthday; birthday blank on all 21. The repo .env DATABASE_URL points at the LOCAL DB, so a dry run there proves nothing about live. The enrol dry run is NOT done.

## Next step
1. Finish #939 (above).
2. Enrol dry run against live: it needs a live DATABASE_URL in the run's env (a dry run only reads). Command shape: `bin/engine enrol class <csv> --grade K1 --campus Gurukul --from 2026-11-23 [--teacher <educator email>]`; Nimish adds `--apply --by <his email>`. Tell him: birthdays are blank on all 21, rows 18–19 have a first name only, and we need the K1 class educator's email for --teacher.
3. ADR 0108 ticket 4 (form mark → activity_observation + evidence_event, G6.4) via loop plan; tick G6.6 in the same job.
4. Small ticket: people.py:243 dry-run label "engine enrol k2", plus the stale docstrings.

## Blocked
- Waiting on Nimish only for the --apply run and his OK on the new-activity words (docs/loop/notes/fn10-new-activity-words.md; already live as drafted).

## Don't repeat
- Read the CI failure lines yourself before writing a re-plan job: the earlier diagnosis "the CLI lacks an option" was wrong.
- `bin/testdb fresh` needs an EMPTY database: `create database t<N>` first, and run `uv sync` in a fresh worktree's packages/engine.
- Don't put export/VAR= in .loop.json commands, or 2>&1 beside test paths in briefs. Don't re-ask K1's campus. Never copy children's names anywhere.
