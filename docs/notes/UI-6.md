# UI-6: timetable, fortnight, draft, moves, rules

Branch `ui-6-timetable`, issue #580. Scope: `specs/UI-6/spec.md`.

## State (10 Nov 2026)

Just started: the spec is copied, nothing is built yet. Old pages (`/educator/week`, `/timetable/rules`) stay live until their
specs have moved (same rule as UI-4).

## Backend gaps (sent to the orchestrator)

- No engine route for **Go live** (`tt_live.go_live` is CLI-only) and the go-live "what changed" report is not stored, so
  Go live and the what-changed table go on the inventory's pending list.
- `fortnight.state` is planning / frozen / aligned / approved / list_sent; SPEC's stepper says drafted / approved / live / frozen.
- Routes that exist: `/fortnight/state`, `/fortnight/move`, `/timetable/generate`, `/timetable/link`, `/timetable/move`,
  `/timetable/clash/accept`, `/timetable/rules/read|change`. All check only "on the staff list": the web layer checks the
  coordinator group (`public.my_reach('staff') = 'all'`, as `requireStaffEditor`) first.
