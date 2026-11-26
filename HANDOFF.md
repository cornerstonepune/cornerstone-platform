# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 (session 3) · **By:** Plan (Opus) · **Model:** claude-opus-5-5
**Milestone:** M6 K1 pilot · **Branch:** plan/k1-pilot-offers (pushed, PR NOT opened yet)

## State
- ADR 0113 written: K1's signed-off activity choices offered, F001–F006 skill links, K1 observed weights + rule = K2's.
- Migration `supabase/migrations/20270218090000_k1_pilot_offers.sql` + `supabase/seed/config.json` (timetable.heads,
  observed.weights). Both settings are seed_once, so `engine load --settings` never updates live: the migration does.
- Test `packages/engine/tests/test_k1_pilot_offers.py` written, NOT RUN yet (not in core.txt).
- Fresh DB built at `postgresql://postgres:postgres@127.0.0.1:54329/k1offers` (migration applied cleanly, 186 migrations;
  `engine load` was still running at session end — check it finished).
- Found on live (read-only, 26 Nov): K1 `grade.secure_level` was NULL, so no K1 observed picture even with weights;
  the migration sets K1's rule to K2's (min_adults 1). Live heads == seed heads before change.

## Next step
1. `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/k1offers` run the test; prove red by emptying the
   migration and restoring main's config.json, then green. Fix the test only if it is wrong (e.g. `_lesson` import,
   `evidence_written` count).
2. Add `tests/test_k1_pilot_offers.py::*` to tests/core.txt? (needs ENGINE_CORE_MAX bump) — or leave nightly; decide.
3. PROJECT.md: G6.4 point at this test; add G6.7 "the 8 signed-off K1 choices are offered". Open PR (do not merge).

## Blocked / for Nimish
- K2 rhymes/clay/music lessons now also offered K2 Music/English/Maths (heads are not per grade). Ticket after pilot.
- ACT-K2-M0018 (shared with K1 via also_bands) is still refused on K1 clay: ensure_offered ignores also_bands. Code ticket.
- Check the six skill choices and the K1 = K2 observed assumption (ADR 0113 tables).

## Don't repeat
- Editing config.json alone for a seed_once key does nothing on live.
- `grep -r` over the repo root times out; use the Grep tool scoped to a folder.
