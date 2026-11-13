# CP-50: K2 children who arrive after 09:00 count as late

Spec: issue #746, `specs/CP-50/spec.md`. Branch `claude/kind-cannon-tnvvhy`.

## Verified

- Live, read-only, 13 Nov 2026: `attendance.start_times` = `{}`; K2 has 1,330 present days loaded, 76 with an in-time
  after 09:00 (5.7%). (Supabase MCP, `select program, count(*) … from attendance group by program`.)
- Tests: `packages/engine/tests/test_cp50_start_time.py` (Done when 1–3). `test_attendance.py`'s "no start time set"
  case now sets the empty value itself, since the seed now holds K2's time.

## Handoff

- Live step: merge, then the normal pipeline (`migrate live`) applies `20270128110000`. Needs Nimish's word in the
  session that merges. Expected on live after: setting `{"K2": "09:00"}`, latest migration `20270128110000`, 82 tables.
- Other programs' start times (Grade 3, Daycare) are still to be asked of the school.
