# ui-b5-class-picture — the page charter's B5: Class picture (Children)

Spec: `docs/frontend/page-charter.md` §B5, Part A, and Part C's row "A child → becomes B5's panel opened full page".

## Verified

- `/children/[class]` is a Workspace: the skill chooser (All skills or one skill) is the page's one primary action; the class is a grid of
  child cards (`components/class-grid.tsx`, the lesson page's look) coloured by state on the one scale (`lib/state-scale.ts` `colourState`,
  `weakestOf`; `lib/class-picture.ts`); the right side is the DetailPanel: four stat tiles (secure · practising · needs help · not seen) with
  nothing chosen, the child panel (`components/children/child-panel.tsx`, reads in `lib/child-panel.ts`) with a child chosen.
- `/children/[class]/[roll]` keeps its address and is the same panel opened full page; its tabs carry the graph, tables, trend, the full
  timeline and the answers that page had.
- Held by `apps/web/tests/u87-class-picture.spec.ts`, one test per charter line; `u72-children`, `u77-picture-child-wireframe` and
  `u73-child-answers` updated where B5 retired the stack bar, grouping, rail and clusters, and moved the answers into the Papers tab.
- Local DB (`cs_test`): u87, u72, u73, u74, u75, u76, u77 — 36 passed. All 75 specs naming `/children`: 376 passed, 12 failed, none on
  these two pages (u18's search box is on `/children`, the table, untouched here; the rest are Today, assessments, the calendar, across
  classes and needs-doing, on a database other sessions were writing at the same time).
- `bin/check`: 60 passed, 4 skipped. `npx tsc --noEmit -p .` and `npx eslint --max-warnings 0 .` in apps/web: clean.
- Wireframes `picture.html` and `child.html` redrawn with `screens.json`; `node docs/frontend/wireframes/check.mjs`: all clear.

## Handoff

- Open for Nimish: a child who needs help (a red-coloured state) has an amber card with the needs-help mark, not a red one, because
  DESIGN.md §3 and SPEC.md say a child's square is never red; the "needs help" stat tile and chip are red. One word from him settles it.
- "All skills" colours each child by the state that most needs the educator (needs help, then practising, then secure); a grey row
  ("not enough yet") counts with not seen.
- Retired with B5: the picture's stack bar, grouping by state, the "Secure over six fortnights" spark (it never had data), the rail and the
  clusters (with `pictureClusters` and the unused `children.close_to_secure_seen` read).
