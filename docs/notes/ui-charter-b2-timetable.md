# ui-charter-b2-timetable — the page charter's B2: the Timetable's week

Spec: `docs/frontend/page-charter.md` B2 (step 4 of its plan, after B4).

## Verified

- A block opens its lesson in the right panel (`components/lesson-panel.tsx`, the parts `/period/[id]` uses); the coordinator's Move, Edit
  and Choose activity are at the top of that panel; no block holds a button. Held by `apps/web/tests/u87-timetable-page.spec.ts`.
- With nothing chosen the panel counts the days shown, not the fortnight: lessons, moved by hand, clashes not accepted (the clashes now
  filtered to the days shown), and each subject's whole share of the lessons by the subject's own name (`SubjectMix percent`,
  `lib/whole-percents.ts`, adding to 100). `u87` tests both weeks against the rows.
- The lessons-by-subject table is gone from the page, with `lib/timetable-subjects.ts` (its only reader); Time by subject is B3, on the
  engine's `POST /timetable/time` (CP-41). The u79 test of that table is removed with it.
- `docs/frontend/screens.json` (timetable: blocks, elements without the old rail, done_when) and `wireframes/timetable.html` (the panel's
  summary in the rail's place) redrawn together; `node docs/frontend/wireframes/check.mjs` and `--gaps`: all clear.
- `bin/check`: 60 passed, 4 skipped. `npx tsc --noEmit -p .` and `npx eslint . --max-warnings 0` in apps/web: clean.

## Handoff

- Live: nothing until merged.
- Next: B1 today, B6 assessments, B5 class picture, B3 analytics (reads `POST /timetable/time`).
