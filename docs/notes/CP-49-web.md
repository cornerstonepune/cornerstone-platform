# CP-49 (web): the lesson page marks the class against the activity's rubric

The frontend half of CP-49 (issue #739): `/period/<lesson>` as page charter B4 draws it. The engine half is the backend's
(`docs/notes/CP-49.md` when it lands); this note is the web branch's own, so the two never conflict.

## Verified

- `npx tsc --noEmit -p .` and `npx eslint --max-warnings 0 .` in `apps/web`: clean.
- `bin/check`: passes (the wireframe check holds `docs/frontend/wireframes/period.html` to the new `period` elements).
- `uv run pytest -q tests/test_layout.py tests/test_states_and_subject.py tests/test_levels.py`: 30 passed.
- `npx playwright test tests/u86-lesson-page.spec.ts tests/u85-lesson-page.spec.ts tests/u84-charter-a.spec.ts tests/u75-timetable-b.spec.ts`:
  all pass; u86's two save tests are `test.fixme` until the engine serves `/lesson/level`.
- `u76-period` (two tests) and `m1-09-calendar` (two tests) fail locally on leftover rows (a fortnight number taken, an
  extra K2 period); they fail the same on `origin/main`.

## Handoff

- Live on this branch: the child grid (`app/(app)/period/[id]/child-levels.tsx`), the panel's tabs Activity · Rubric ·
  Materials · History (parts shared with the timetable's lesson panel, `components/lesson-panel.tsx`), the no-activity state.
- Stubbed: `/lesson/level` and `/lesson/level/read` (CP-49 v1) are called untyped in `lib/educator/data.ts` because
  `lib/engine-routes.ts` does not list them yet; when the regenerated contract lands, drop the two casts.
- Next: once the route is live, turn u86's two `test.fixme` into tests; then retire the CP-40 class form folded under the
  grid ("Mark against the expected level"), and give History the counts per level from the read.
