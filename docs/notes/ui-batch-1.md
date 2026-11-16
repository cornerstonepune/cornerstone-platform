# UI batch 1

One branch, one PR, one full CI for the screens Nimish asked for on 16 Nov 2026. Web, plus one engine route (CP-59); no migration.

Merged in this order, never rebased: CP-57 (`cp-57-timetable-in-one-place`, #790's head), CP-58 + CP-59 + CP-60 (`cp-60-voice-from-lesson`, which already holds 58 and 59), then CP-61 (#788), CP-62 (#795), CP-63 (#797). The only conflict was in `components/blocks.css` (CP-61's card rules and CP-62's checker rules, both kept).

## Verified (fresh `bin/testdb fresh` database of this branch)
- `bin/check` 67 passed, 4 skipped; `tsc --noEmit` and `eslint .` clean (tsc ignores the generated `LayoutProps` names, which `next build` makes).
- Browser specs, 86 + 105 passed: p61, p62, p63, u87, u101, u102, u103, u93, u75, u82, u90, u84, u98, u74, u77, u79 (timetable), u80, u81, u50, u78, u79 (checking), u96, s4, u38, s42, u16.
- Engine: `tests/test_tt_delayed.py`, `tests/test_tt_time.py` 21 passed.
- One fix made in the merge: `u13-route-walk` named the pages outside the menu; CP-58 took Materials out of the Timetable group, so `/educator/materials/review` (reached from the Materials page) is now outside it and is named there.

## Handoff
- Each CP's own note is `docs/notes/CP-<n>.md`.
- Screenshots of CP-62 at 400 and 1440 px, 2x: `docs/notes/img/`.
