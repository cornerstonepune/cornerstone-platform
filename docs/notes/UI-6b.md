# UI-6b: the second part of the timetable work

Branch `ui-6b-timetable`, issue #586, draft PR. Scope: `specs/UI-6b/spec.md`. Follows UI-6 (#581, merged as 5ed2908).

## State (11 Nov 2026)

Done and tested (`tests/u75-timetable-b.spec.ts`): Done when 7, the Timetable's Day view is the default at 400 px (`app/(app)/timetable/day-on-phone.tsx`,
a client helper that rewrites the address once; a chosen view is kept; desktop is unchanged).

## Waiting
- Go live and the what-changed table (Done when 1 to 3): the engine's `POST /timetable/go-live` is backend draft PR #621 (not on main). It answers the report once
  (nothing is stored), so the fortnight page shows it from the response. Built against #621's branch for local runs.
- The journey (4) needs Go live. The inventory drives and `merged_slices` (5) wait for the 12-child fixtures (UI-4 builder will message).
- Per-row Edit on the rules page (6) and retiring the old pages (8, 9, issue #599): `/educator/week`, `/educator` (day), the old rules forms.
