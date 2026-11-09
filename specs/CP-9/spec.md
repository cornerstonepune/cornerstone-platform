# CP-9: Observations become evidence for real, through the typed form

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/457
Scope locked by: Nimish (the label scope-locked on the GitHub issue, 8 Nov 2026)
Waits for: CP-4. Plan: docs/backend-plan.md. Roadmap tasks M1-01 to M1-04a. Tier 3 (migration, scheduled job).
(The issue's first line, "DRAFT for Nimish. Not locked.", is stale since the label was added and is left out here.)

## What

An educator's typed observation reaches a child's picture by itself, and can be corrected. Voice stays off until CP-10. Today nothing rebuilds the picture, a confirmed note cannot be corrected, and "unplanned" is always empty.

## Done when

1. A confirmed note changes the child's state by the next morning without anyone running a command. (Test with a clock; LIVE: the nightly job has run and logged.)
2. A confirmed note can be corrected through the engine; the correction is a new row that supersedes the old one and the old row is never changed. (Test.)
3. "Unplanned" is computed from the sessions that happened and is not empty when sessions exist without a plan line. (Test.)
4. The picture reads only confirmed notes. (Test.)
5. Three signals stay distinct: blank, wrong, wrong-with-working. (Test.)
6. The nightly rebuild leaves the 1,838 existing evidence records and 283 child states unchanged. (LIVE: read-only counts.)
7. 20 real notes confirmed by the K2 educator, and the coordinator's hand calculation for 5 children matches the system exactly. (Evidence recorded as counts only, no names.)

## Out of scope

Voice recording and Sarvam (CP-10). Screens. Parent reports (CP-19).
