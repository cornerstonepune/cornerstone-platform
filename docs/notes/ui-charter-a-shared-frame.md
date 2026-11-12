# ui-charter-a-shared-frame — the page charter's Part A: the shared frame

Spec: `docs/frontend/page-charter.md` Part A (approved by Nimish, 12 Nov 2026), step 3 of its plan.

## Verified

- The sidebar replaces the bar's four doors and the "… pages" fold: `apps/web/lib/menu.ts` (sections), `components/frame/sidebar.tsx`
  (sidebar, folding to icons, the phone's drawer), `components/frame/walk.tsx` (the lit section). Held by `apps/web/tests/u13-frame.spec.ts`
  (2, 2b, 6, 9), `u53-the-menu.spec.ts`, `u75-setup-nav.spec.ts`, `u60-ui-wave-1-flow.spec.ts`.
- The DetailPanel (`components/detail-panel.tsx`, `detail-panel-client.tsx`) on its first page, the Timetable's week: a block opens the lesson
  (`components/lesson-panel.tsx`, reading `lib/lesson-view.ts`, the same loader as `/period/[id]`). Held by `apps/web/tests/u84-charter-a.spec.ts`.
- StatTile, SubjectTag, the one state scale (`lib/state-scale.ts`), Cards' two chips, FilterBar's More filters: `u84-charter-a.spec.ts`,
  the blocks gallery (`u71-blocks.spec.ts`, its baselines redrawn on CI's runner).
- `bin/check`: 60 passed, 4 skipped. `npx eslint --max-warnings 0` over apps/web: clean.
- Wireframes: all 32 screens redrawn with the sidebar; `node docs/frontend/wireframes/check.mjs`: all clear.

## Handoff

- Live: nothing until merged. Pages other than the Timetable's week keep their old right side (rail) until their own screen's PR.
- Next: B4 lesson, B2 timetable (its subject table moves to B3), B1 today, B6 assessments, B5 class picture, B3 analytics (needs an engine read).
- Open for Nimish: red on "needs help" and rubric level 1 (charter A3) against DESIGN.md §3 "red is never a child"; School hidden from
  educators (charter A1) against the 22 Oct "keep all features available for both"; Upload papers and What needs doing kept in the menu
  until B6 and B1b absorb them.
