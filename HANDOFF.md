# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-24 · **By:** Plan · **Model:** claude-opus-5-5
**Milestone:** M6 K1 pilot · **Branch:** plan/k1-pilot (ADR 0107, 0108, M6, F.N 10 W1 fixture; PR open) · seed `plan/t925` pushed

## State
- PROJECT.md §5 has M6 (G6.1–G6.5); ADR 0108 has the importer's refined rules. Issues #925 (ticket 1, reader + `load-k1`), #926 (ticket 2, `Session.planned`, blocked by #925).
- Fixture: `supabase/seed/k1_tabs_2026_11_24/fn10_w1.csv` (sheet rows 349–372, merges filled).
- **Seed `plan/t925` pushed** (branched from plan/k1-pilot, so it carries this PR's commits until it merges): `k1_week.py` skeleton (rules in its docstring), `load-k1` stub, `Vocabulary.k1`, seed vocabulary `meal` + `k1` block, workflows.json entry; `tests/test_k1_week.py` (7, 6 red, 1 guard green) and `tests/holdout/test_k1_week_hidden.py` (6 red, one on the DB). All 13 went green against the throwaway oracle `docs/loop/notes/k1-week-oracle.py.txt` before the skeleton was restored. `bin/check` passes on the seed.
- `--grade` is required on `load-k1` (`test_grades` forbids a grade code in Python); #925 body updated to say so.
- Visible K1 tests are NOT in `tests/core.txt`: the engine core is at its 230 budget (`test_core_budget`). Hidden tests run on every PR, so PR CI still guards the reader.

## Next step
1. Merge this plan PR when CI is green, then the coordinator can build #925 from `plan/t925`.
2. Next planning job: seed `plan/t926` from `plan/t925` — `Session.planned: bool = True`; `tests/test_k1_planned.py` (blank / name-only cell → planned False) + holdout DB row check. Not done in this job.
3. Tickets 3 (`engine enrol --grade`) and 4 (K1 form mark → activity_observation + evidence_event) still to write.

## Blocked / open questions (for Nimish, not blocking tickets 1–2)
- K1 campus: Gurukul (sheet) or Neev (config)? Who writes K1 level words? Two-part cells reading B — confirm. Radhika's Children List CSV + email.

## Don't repeat
- The sheet's merges are only visible via get_spreadsheet `fields: sheets.merges`. ADR Goal lines: `Goal: none — why`. Run `uv run ruff format --check tests engine`. No grade code literal in Python (`test_grades`). Core budget is full: new visible tests go nightly unless something leaves the core.
