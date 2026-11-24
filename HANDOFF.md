# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-24 · **By:** Plan · **Model:** claude-opus-5-5
**Milestone:** M1 nightly green (G1.1 engine) + new: K1 pilot (not yet planned) · **Branch:** plan/k1-pilot (ADR 0107 only)

## State
- Nimish asked for a K1 pilot ("fortnight 10 and 11"): educator Radhika ma'am clicks a timetable period, fills rubrics, uploads a voice note -> knowledge graph.
- Read the K1 Google Sheet (ADR 0107). F.N 10 and 11 ARE in tab gid 1395547310 from row 349 (F10 W1 23-27 Nov and W2 30 Nov-4 Dec fully planned; F11 W1 7-11 Dec and W2 14-18 Dec are mostly empty frames, rows 397 and 421). K1 is a section, Radhika its educator (Nimish confirmed).. Existing K2 tables cover most of the shape (fortnight, period, timetable_slot, plan_entry, session).
- ADR 0107 now has its Goal line; `bin/check` passes (72 passed, 4 DB checks skipped, no TEST_DATABASE_URL). Nimish then pointed to row 349 onwards; no PR opened for plan/k1-pilot yet.
- Nothing built. Previous work (plan/engine-green, PR #922, ticket #923 seeded on plan/t923) is unchanged and still stands.

## Next step
1. Plan the K1 pilot now (no open question blocks it; default K1 gets its own period rows): to-spec -> loop-ticket. Importer must split two-period cells and keep empty cells as 'not planned yet'.
2. Then `to-spec` -> `loop-ticket` for the K1 pilot (importer, activity mapping, period page rubrics + voice note, voice -> graph); check S3/S4/S5 wireframes cover K1.
3. Previous queue: #922 merge on green; `loop prep 923`; fortnight-grid.tsx:18 subject labels; browser failures; data-register proof (G1.3).

## Blocked / open questions
- None. (F.N 11 academic cells are empty in the sheet: Radhika must fill them before 7 Dec.)

## Don't repeat
- Sheet tab gid 1395547310 is `Sample_Time Table - 26-27` (F.N 4-7), not a 10/11 tab. Read via the Google Sheets connector `get_values` by range (~6k tokens per 100 rows).
- The hook blocks the orchestrator from committing the approvals file, and from any command that names it.
- `bin/testdb fresh` needs an empty database; make a new one. `uv sync --all-extras` for a second checkout. Run `uv run ruff format --check tests` before stopping.
- 12 local-only failures on unchanged main (SSL download, test_deploy etc.) are not ours.
