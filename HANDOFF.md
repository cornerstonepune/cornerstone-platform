# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-24 · **By:** Planner (loop-guard fix) · **Model:** claude-opus-5-5
**Milestone:** M6 K1 pilot · **Branch:** plan/handoff-guard-930 · #927, #928, #930 merged · seed `plan/t925` pushed; build PR #929 open

## State
- loop-guard fix merged (PR #930): builder rules now read only the builder's own non-merge commits after Plan-base that are not on main, so main merged into a build branch no longer counts as builder work. Test `packages/engine/tests/test_loop_guard.py` (nightly only, not `core`; red on old guard, green on fix, locally). Same bug is in the loop plugin template `templates/.github/loop/check_pr.py` (fix upstream too).
- PROJECT.md §5 has M6 (G6.1–G6.5); ADR 0107 + 0108 (survey, importer rules). Issues #925 (K1 reader + `load-k1`), #926 (`Session.planned`, blocked by #925).
- Rubric marking is already on approved S3 (period page, child cards vs `activity.level_0..3`): no new wireframe. No K1 class on live yet.
- Fixture `supabase/seed/k1_tabs_2026_11_24/fn10_w1.csv` (sheet rows 349–372, merges filled).
- Seed `plan/t925` (from plan/k1-pilot): `k1_week.py` skeleton, `load-k1` stub, `Vocabulary.k1`, seed vocab `meal` + `k1`; `tests/test_k1_week.py` (7) + `tests/holdout/test_k1_week_hidden.py` (6) red against the stub, green against the oracle `docs/loop/notes/k1-week-oracle.py.txt`. `bin/check` passes.
- `--grade` required on `load-k1` (`test_grades`). Visible K1 tests are nightly only (core budget 230 full); hidden tests run on every PR.

## Nimish, 24 Nov (ADR 0109) — takes priority
- Pilot is **Gurukul** K1 (K1 is at Neev and Gurukul). Focus: only F.N 10's activities; get their rubric words sorted first.
- Rubric draft done: `docs/loop/notes/fn10-rubric-draft.md` — 15 activities with DRAFT level_0..3 words, marked for Radhika/coordinator sign-off. Nothing seeded.
- Matches (ADR 0109 table updated): 0665 + 1146 confirmed; new K1-0782 (Block Room art & form), K2-M0018 (clay, K2 band), K2-0449 (Khari Kamai, K2 band, has words). 6 lessons have no activity: Sun & Moon rhyme, number tracing 5/6, trace R/D, Hindi farm animals, Hindi Swar ए, Memory Drawing.
- Next: Nimish sends the sheet to Radhika; after sign-off, one plan job seeds the words (+ `also_bands` K1 on the two K2 rows if she agrees) and adds the 6 missing activities.

## Next step (after the rubric job)
1. `gh pr update-branch 929`, then `loop ci 929` so its CI runs the new guard (a plain re-run reuses the old merge ref) → reviewer → merge.
2. (#925 build is PR #929.)
3. One narrow `loop plan` job: seed `plan/t926` only (`Session.planned: bool = True`; `tests/test_k1_planned.py` + holdout DB row check).
4. Then one job each for tickets 3 (`engine enrol --grade`) and 4 (K1 form mark → activity_observation + evidence_event).

## Blocked / open questions (Nimish; block going live, not tickets 1–2)
- K1 campus: Gurukul (sheet title) or Neev (`school.campus_grades`)? Radhika sign-off on the F.N 10 draft words? Two-part cells reading B (one session, coordinator picks activity) — confirm. Radhika's Children List CSV + email (Nimish runs enrol himself).

## Don't repeat
- One deliverable per `loop plan` job, briefed with settled decisions: two whole-milestone jobs hit CONTEXT FULL (LESSONS.md).
- Sheet merges only visible via get_spreadsheet `fields: sheets.merges`. ADR Goal lines: `Goal: none — why`. Run `uv run ruff format --check tests engine`. No grade code literal in Python (`test_grades`).
- Local test DB dirty (`bin/testdb fresh` says "relation tenant already exists") → `drop database postgres with (force)` + create via template1, then `bin/testdb fresh`. Unrelated core failures in `loop finish` came from this.
- A builder handoff with any "Blocked" section, even "Blocked: Nothing", fails `loop finish` (#925 lost an attempt; now in its Don't list). #925 has used 3 attempts.
