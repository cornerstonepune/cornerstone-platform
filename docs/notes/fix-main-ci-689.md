# fix-main-ci-689: main's CI green again (#689)

## Verified
Main 7cbe096, run 43062444569: the failures below were read in its logs before any change.

| Failing test | Cause | Fix |
|---|---|---|
| `test_levels.py::test_no_file_outside_the_maths_library_names_a_level` | `lib/setup-overview.ts` wrote the four level names in code | reads them from `lib/levels.ts` (the `difficulty` rows), as the bank and paper pages do |
| `test_guide.py` (4) | "Class results" left the menu in #684; its guide page stayed, quoting a button that is gone | the page becomes the Children page's guide (`guide/pages/children.json`, for `/children`), drawn as the Children door is now; links follow; the Children menu entry carries its guide |
| `screens.spec.ts` /growth (2), menu, child page; `u2-children`; `u70-move-a-child`; `u71-results-by-topic` | `/growth` now 308s to the class picture, which is behind `voice.screens_enabled` (UI-3b) | these specs switch it on for themselves, as `u21-class-by-topic` does; `/growth`'s heading is "Class picture"; the menu row lists "Children"; the child's page is reached By topic → topic → skill → child |
| `u13-route-walk` 3 clicks | the walker dropped any link with a dot as a file; a question's key has dots | files are named by extension |
| `u70-inventory` classes · coordinator · 1440 | the classes table capped at 40 rows, and its "Later →" led back to page 1; also a fixture educator was named "Mv Teacher" | every class shows (the page's own "read whole"); the fixture is "Mv Educator" |
| `u76-notes-loop` Record at 400 px | `boundingBox()` read a streamed button while still hidden (null) | waits until both are visible, then the same two measurements |

## Handoff
- Live risk, not fixed here (product call): with `voice.screens_enabled` off, `/growth` (Class results) now lands on "Children are shown once the school has switched the educator screens on".
- `apps/web/guide/**` is read only by `test_guide.py`; its deletion is planned in `UI-12.md` §3 with backend sign-off.
- `u70-inventory` `staff · coordinator · 1440` (taken in at the orchestrator's request): failed from 18:30 to 24:00 UTC. The app ends a grant on the
  school's day, and `CHECKS["grant-ended"]` and the grant fixture compared it with the database's UTC `current_date` (seen at 19:18 UTC: `valid_to` 2026-11-12,
  `current_date` 2026-11-11). Both now read the school's day from `school.time_zone` through `dayIn` (`lib/school-clock.ts`). Passed at 19:21 UTC.
