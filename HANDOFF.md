# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-24 · **By:** Plan · **Model:** claude-opus-5-5
**Milestone:** M1 nightly green (G1.1 engine) + new: K1 pilot (not yet planned) · **Branch:** plan/k1-pilot (ADR 0107 + this file; no PR yet)

## State
- Nimish asked for a K1 pilot: K1 is a section at Neev, Radhika ma'am is its educator. She opens the timetable, clicks a period, fills rubrics, uploads a voice note -> knowledge graph.
- K1 sheet `1O2qf5l7dRdVZMGfiaUWhw4KcTe8GpRErmnOrFF0uS2Q`, tab gid 1395547310 `Sample_Time Table - 26-27`: F.N 10 W1 (23-27 Nov, from row 349) and W2 (30 Nov-4 Dec) are fully planned; F.N 11 W1 (7-11 Dec) and W2 (14-18 Dec) are mostly empty frames (dates, word, events only). Details: docs/adr/0107-k1-pilot-sheet-findings.md.
- Existing K2 tables cover the shape: fortnight, school_day, period, timetable_slot, plan_entry, session (migration 20261231090000).
- Tests: `bin/check` = 72 passed, 4 skipped (DB checks need TEST_DATABASE_URL). Nothing built. Earlier work (PR #922 engine-green, ticket #923 on plan/t923) unchanged.

## Next step
1. Plan the K1 pilot: `to-spec` -> `loop-ticket`. Default: K1 gets its own `period` rows. Importer splits two-period cells (e.g. "Clay ... Academic 2 English ...") and keeps empty cells as "not planned yet".
2. Check wireframes S3/S4/S5 (period, notes, confirm) cover K1 periods; if not, new wireframes need Nimish's own sign-off before any frontend code.
3. Then: period page rubrics + voice note upload -> engine -> evidence_event -> child graph (W3 path exists).
4. Old queue: merge #922 on green; `loop prep 923`; fortnight-grid.tsx:18 subject labels; browser failures; data-register proof (G1.3).

## Blocked / open questions
- None. F.N 11 academic cells are empty in the sheet: Radhika must fill them before 7 Dec.

## Don't repeat
- Read the sheet by range with the Sheets connector `get_values` (~6k tokens per 100 rows); read ALL columns, not only column A, before saying a week is unchecked.
- ADRs need a `Goal:` line (test_promises). Writing the word for sign-off commands inside a shell command trips the lane hook; keep such words out of commands. `bin/testdb fresh` needs an empty database. Run `uv run ruff format --check tests` before stopping.
- 12 local-only failures on unchanged main (SSL download, test_deploy etc.) are not ours.
