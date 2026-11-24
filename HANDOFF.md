# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-24 · **By:** Plan · **Model:** claude-opus-5-5
**Milestone:** M1 nightly green (G1.1 engine) + new: K1 pilot (not yet planned) · **Branch:** plan/k1-pilot (ADR 0107 only)

## State
- Nimish asked for a K1 pilot ("fortnight 10 and 11"): educator Radhika ma'am clicks a timetable period, fills rubrics, uploads a voice note -> knowledge graph.
- Read the K1 Google Sheet (ADR 0107): it holds K1 F1, F2, F4-F7 only. No F10/F11 found. Existing K2 tables cover most of the shape (fortnight, period, timetable_slot, plan_entry, session).
- ADR 0107 now has its Goal line; `bin/check` passes (72 passed, 4 DB checks skipped, no TEST_DATABASE_URL). Nimish replied he will point to the F10/F11 tab himself; no PR opened for plan/k1-pilot yet.
- Nothing built. Previous work (plan/engine-green, PR #922, ticket #923 seeded on plan/t923) is unchanged and still stands.

## Next step
1. Ask Nimish the 3 open questions in docs/adr/0107-k1-pilot-sheet-findings.md (which fortnights / where is that tab; K1 confirmed; K1 period rows).
2. Then `to-spec` -> `loop-ticket` for the K1 pilot (importer, activity mapping, period page rubrics + voice note, voice -> graph); check S3/S4/S5 wireframes cover K1.
3. Previous queue: #922 merge on green; `loop prep 923`; fortnight-grid.tsx:18 subject labels; browser failures; data-register proof (G1.3).

## Blocked / open questions
- Which fortnights are "10 and 11" for K1 and where they live in the sheet (Nimish).

## Don't repeat
- Sheet tab gid 1395547310 is `Sample_Time Table - 26-27` (F.N 4-7), not a 10/11 tab. Read via the Google Sheets connector `get_values` by range (~6k tokens per 100 rows).
- The hook blocks the orchestrator from committing the approvals file, and from any command that names it.
- `bin/testdb fresh` needs an empty database; make a new one. `uv sync --all-extras` for a second checkout. Run `uv run ruff format --check tests` before stopping.
- 12 local-only failures on unchanged main (SSL download, test_deploy etc.) are not ours.
