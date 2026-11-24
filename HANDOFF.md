# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-24 · **By:** Plan · **Model:** claude-opus-5-5
**Milestone:** M1 nightly green + K1 pilot (surveyed, not yet ticketed) · **Branch:** plan/k1-pilot (ADR 0107, ADR 0108; no PR yet)

## State
- K1 pilot survey done, written in docs/adr/0108-k1-pilot-plan-reuses-the-k2-path.md. Rubric entry + voice note already exist on the approved S3 page: no new wireframe.
- Live gaps: no K1 class/children (only K2 A); K1 activities have no level words (0/634 level_0); sheet says "Gurukul - K1" but config puts K1 at Neev.
- Real F.N 10 W1 cells read (sheet rows 349-372, cols A:H): first line of a cell is the period name, then subject, then text.
- Nothing built; no issues opened; PROJECT.md not yet changed.

## Next step
1. Add the K1 milestone to PROJECT.md §5 with yes/no goals + its ADR (0108 already covers the why; give it the GK1 goals).
2. Tickets in ADR 0108 order: K1 reader + `engine timetable load-k1` (fixture CSV from rows 349-372, no names in it); `Session.planned` in writer; `engine enrol` `--grade`; K1 form mark -> evidence_event check.
3. Seed `plan/t<N>` per ticket; add each visible test file to packages/engine/tests/core.txt (PR CI runs only `-m core` + holdout); prove red; push; open plan PR; `loop ci`.

## Blocked / open questions (for Nimish, not blocking backend tickets)
- Which campus is K1 on: Gurukul (sheet title) or Neev (school.campus_grades, #891)?
- Who writes the K1 activity level words (rubric)? Until then marks show "Not written".
- Two-part cells: ADR 0108 chose one lesson per time slot with parts as plan lines; confirm.
- Radhika's Children List CSV (outside git) and her email, to run `engine enrol --grade K1`.

## Don't repeat
- Read the sheet by range with the Sheets connector `get_values`; read ALL columns.
- ADRs need a `Goal:` line. Keep sign-off command words out of shell commands (lane hook). Run `uv run ruff format --check tests` before stopping.
- `enrolment` uses `class_id`, `activity_skill` uses `activity_code` (not `_id`).
