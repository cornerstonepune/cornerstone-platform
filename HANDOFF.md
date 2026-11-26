# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 (session 4) · **By:** Plan (Opus) · **Model:** claude-opus-5-5
**Milestone:** M6 K1 pilot · **Branch:** plan/k1-pilot-offers (pushed, PR opened, NOT merged)

## State
- ADR 0113 + migration `20270218090000_k1_pilot_offers.sql` + `supabase/seed/config.json`: K1's 8 signed-off activity
  choices offered, F001–F006 skill links, K1 observed weights + rule = K2's.
- `tests/test_k1_pilot_offers.py` RUN on local `k1offers` DB: 11 passed (346 s). Red proof (migration blanked, main's
  config.json): 10 failed, 1 passed (the settings-consistency test, expected). Test reformatted by ruff (bin/check).
- PROJECT.md: G6.4 now points at this test; G6.7 added (8 choices offered). Not ticked: they tick when live has them.
- Test left out of tests/core.txt: 6 min is too slow for every PR; it runs nightly.

## Next step
1. `loop ci <pr>` for the plan/k1-pilot-offers PR; when green, Nimish (or coordinator, if he says) merges.
2. After merge + release: the migration itself updates live config (seed_once keys); then on live check the 8 lessons
   accept their activity and tick G6.4/G6.7.

## Blocked / for Nimish
- K2 rhymes/clay/music lessons now also offered K2 Music/English/Maths (heads are not per grade). Ticket after pilot.
- ACT-K2-M0018 (shared with K1 via also_bands) is still refused on K1 clay: ensure_offered ignores also_bands. Code ticket.
- Check the six skill choices and the K1 = K2 observed assumption (ADR 0113 tables).

## Don't repeat
- Editing config.json alone for a seed_once key does nothing on live.
- `grep -r` over the repo root times out; use the Grep tool scoped to a folder.
- Check `pgrep -fl "loop plan"` before working a plan branch: a planner may still be running in this same checkout.
