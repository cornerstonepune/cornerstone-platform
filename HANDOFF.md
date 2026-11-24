# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-24 · **By:** Plan · **Model:** claude-opus-5-5
**Milestone:** M6 K1 pilot (added to PROJECT.md) · **Branch:** plan/k1-pilot (ADR 0107, 0108 accepted, M6, fixture; no PR yet)

## State
- PROJECT.md §5 has M6 (G6.1–G6.5) and two open questions; ADR 0108 Goal line points at M6 and has a "Refined when the tickets were written" section (holidays from calendar CSV, merges filled in capture, parts by `k1.part_heads`, plan_key from subject, week B ords from 501).
- Issues opened: #925 (ticket 1: `k1_week.py` reader + `load-k1`), #926 (ticket 2: `Session.planned`, blocked by #925). Bodies are final.
- Fixture committed: `supabase/seed/k1_tabs_2026_11_24/fn10_w1.csv` (sheet rows 349–372; merges filled: Meal row B:F, Wed 10:40 = Wed 10:15 PE).
- Throwaway reference reader (to check test expectations, NOT product code): `docs/loop/notes/k1-week-oracle.py.txt`. Delete before the plan PR merges if unwanted.
- No seed branches pushed yet (plan/t925 was started and deleted, nothing on it).

## Next step
1. Seed `plan/t925` from main (after this plan PR merges, so the fixture is there): new `engine/w2_print/k1_week.py` skeleton (`parts_of`, `read_k1_week_csv` raising NotImplementedError; docstring = ADR 0108 rules) + add it to workflows.json w2 files; `Vocabulary.k1: dict` field (`v.get("k1", {})`, default_factory) in k2_timetable.py; seed config `timetable.vocabulary`: `"meal"` in fixed_rows, `"k1": {"title": "F\\.N\\s*(\\d+)\\s*Week\\s*(\\d)", "date_format": "%d.%m.%y", "part_heads": ["academic\\s*\\d+","extracurricular","(rhymes|story)\\.\\s*p\\d+","music\\s*\\(guest\\)"], "week_b_first_ord": 501}`; `load_k1` command stub in cli_timetable.py.
2. Visible tests `tests/test_k1_week.py` (11 periods, starts 09:30…13:25, 24 Nov holiday from calendar → 44 sessions, Mon 10:15 links "math" line, Wed 12:15 two-part links none, CLI dry run prints no school text); hidden `tests/holdout/` (W2 ords ≥501 + week B, date conflict, Monday-only Meal row, apply twice on a K1 class). Add visible file to tests/core.txt. Prove red. Push.
3. Seed `plan/t926` from plan/t925: `Session.planned: bool = True`; tests `tests/test_k1_planned.py` (blank / name-only cell → planned False) + holdout DB row check.
4. Tickets 3 (`engine enrol --grade`) and 4 (K1 form mark → activity_observation + evidence_event) still to write.

## Blocked / open questions (for Nimish, not blocking tickets 1–2)
- K1 campus: Gurukul (sheet) or Neev (config)? Who writes K1 level words? Two-part cells reading B — confirm. Radhika's Children List CSV + email.

## Don't repeat
- The sheet's merges are only visible via get_spreadsheet `fields: sheets.merges`. ADR Goal lines: `Goal: none — why`. Run `uv run ruff format --check tests`.
