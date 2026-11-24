# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-24 · **By:** Coordinator · **Model:** claude-opus-5-5
**Milestone:** M6 K1 pilot · **Branch:** plan/k1-pilot (PR #927 open, CI running) · seed `plan/t925` pushed

## State
- PROJECT.md §5 has M6 (G6.1–G6.5); ADR 0107 + 0108 (survey, importer rules). Issues #925 (K1 reader + `load-k1`), #926 (`Session.planned`, blocked by #925).
- Rubric marking is already on approved S3 (period page, child cards vs `activity.level_0..3`): no new wireframe. No K1 class on live yet.
- Fixture `supabase/seed/k1_tabs_2026_11_24/fn10_w1.csv` (sheet rows 349–372, merges filled).
- Seed `plan/t925` (from plan/k1-pilot): `k1_week.py` skeleton, `load-k1` stub, `Vocabulary.k1`, seed vocab `meal` + `k1`; `tests/test_k1_week.py` (7) + `tests/holdout/test_k1_week_hidden.py` (6) red against the stub, green against the oracle `docs/loop/notes/k1-week-oracle.py.txt`. `bin/check` passes.
- `--grade` required on `load-k1` (`test_grades`). Visible K1 tests are nightly only (core budget 230 full); hidden tests run on every PR.

## Next step
1. `loop ci 927` → merge #927 when green (`gh pr merge 927 --merge`).
2. Build #925: `loop prep 925` → `loop build 925` → `loop finish 925` → reviewer → merge.
3. One narrow `loop plan` job: seed `plan/t926` only (`Session.planned: bool = True`; `tests/test_k1_planned.py` + holdout DB row check).
4. Then one job each for tickets 3 (`engine enrol --grade`) and 4 (K1 form mark → activity_observation + evidence_event).

## Blocked / open questions (Nimish; block going live, not tickets 1–2)
- K1 campus: Gurukul (sheet title) or Neev (`school.campus_grades`)? Who writes K1 level words (0 of 634 have level_0)? Two-part cells reading B (one session, coordinator picks activity) — confirm. Radhika's Children List CSV + email (Nimish runs enrol himself).

## Don't repeat
- One deliverable per `loop plan` job, briefed with settled decisions: two whole-milestone jobs hit CONTEXT FULL (LESSONS.md).
- Sheet merges only visible via get_spreadsheet `fields: sheets.merges`. ADR Goal lines: `Goal: none — why`. Run `uv run ruff format --check tests engine`. No grade code literal in Python (`test_grades`).
