# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-25 · **By:** Coordinator (loop:run, side session) · **Model:** claude-opus-5-5
**Milestone:** M6 K1 pilot · **Branch:** plan/handoff

## State
- #946 merged (#948, dfedfe27c) and released: CI, deploy engine green. A blank class-list birthday enrols the child with birthday NULL (ADR 0112); a written-but-bad birthday still refuses the run.
- **K1 Gurukul ENROLLED on live (25 Nov, Nimish's go):** class K1-A, 21 children, 21 birthdays not known. Read back on live via Supabase. Route used: AWS profile `cornerstone` -> lightsail key -> ssh ubuntu@engine server -> `docker cp` the CSV into deploy-engine-1 -> `engine enrol class /tmp/x.csv --grade K1 --campus Gurukul --apply --by <staff email>` -> delete both copies. `--by` must be an existing staff email (Nimish: nimish@cornerstoneschool.in). The CSV (names) is ~/cornerstone/private/k1-gurukul-children-2026-v2.csv, outside git; it supersedes the first file (5 rows differed).
- Educator not linked yet: add `--teacher <email>` later, or ask which educator.

## Next step
1. Tick the K1-enrolled goal in PROJECT.md, then G6.5 (F.N 10 W1+W2 for Gurukul K1). Birthdays still to be filled in by the school (needs its own small ticket: re-running the list does not add them to an enrolled child).
2. Reviewer follow-ups from #948 (one small ticket via loop plan): `_fill_birthday` dropped `and birthday is null` so a held birthday gets a no-op write that bumps updated_at; same name typed once with a birthday and once blank enrols two children (ADR 0112 covers only both-blank); tests/test_enrol_blank_birthday.py is not in tests/core.txt, so PR CI never ran it (I ran it locally: 38 passed).
3. Queued small ticket: "engine enrol k2" dry-run label + stale "enrol k2" docstrings.
4. ADR 0108 ticket 4 (G6.4) via loop plan.
- Open question for Nimish: holiday cells (e.g. "Block Room") make no plan lines today; keep or drop them?

## Don't repeat
- `loop build` passes `--allowedTools` space-joined, so `Bash(bin/check *)` splits and every builder shell call is denied (loop plugin bug, #946 lost 3 attempts). Workaround: run the `loop:builder(-small)` subagent from the coordinator session on the brief.
- loop-guard sums each builder commit's lines: two commits double-count. Close+reopen a PR to re-run loop-guard after a body edit.
- Build a ticket's test DB from that ticket's branch (bin/testdb fresh …/t<N>), never from a stale main checkout.
