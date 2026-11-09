# Handover to the session that builds the frontend

Paste the block between the rules into the main orchestration session when the build starts. Everything it names is in
this folder or linked from it. Written 9 Nov 2026 after the four frontend-vision passes with Nimish.

---

You are building the frontend of Cornerstone School OS for a school of about 100 children and seven staff. The design is
finished and decided; your job is to build it exactly, slice by slice, through the Athena loop in `.claude/athena/CLAUDE.md`.
Nothing here is open for re-design. Where you find a conflict or a gap, stop and say so; do not pick.

**Read, in this order, before anything else**

1. `docs/frontend/SPEC.md`: the whole specification. Sections 1 to 5 are the rules, the system, how to build and the
   blocks; section 7 is the slices and the ten generic checks; section 6 is every screen with every control.
2. `docs/frontend/screens.json`: the same inventory as data. It is the oracle: the inventory test reads it, the help page
   is generated from it, and `node docs/frontend/build-spec.mjs` regenerates SPEC.md, scopes.md and the wireframes from
   it. Change the JSON, run the script; never edit the generated files by hand.
3. `docs/frontend/scopes.md`: the slices UI-1 to UI-13 as paste-ready GitHub issues in the Scope form.
4. `docs/frontend/tokens.json`: every colour, font, size and space. Copy it to `apps/web/design-system/tokens.json` and
   generate `tokens.css` from it (UI-1). The design system that mirrors it, with the brand book, the icon map and the first
   blocks' previews: https://claude.ai/code/artifact/caaa43e4-681b-4ac0-82c9-ffb866116514 (`read` its `project/README.md`).
5. The wireframes of all 34 screens: https://claude.ai/code/artifact/c6bf8133-9aaa-4c8c-b951-b27afc114996. The clickable
   sketch of the walk: https://claude.ai/code/artifact/43bfce16-b41c-42fe-8b20-1ec11960ea74.
6. `docs/decisions/2026-11-09-white-ground-for-the-site.md` and `docs/decisions/2026-11-09-site-type-and-subject-colours.md`.
7. `docs/ux-rules.md`, `apps/web/lib/ux-rules.ts`, `apps/web/lib/menu.ts`, `apps/web/lib/icons.tsx`,
   `apps/web/components/status-chip.tsx`: what exists and is kept. `packages/engine/tests/test_ux_rules.py` and
   `apps/web/tests/u51-ux-rules.spec.ts`, `u53-the-menu.spec.ts`, `screens.spec.ts`: the tests that already hold the rules.

**Decided; do not reopen**

- The ground is white; the palette is the brand's materials; type is Source Serif 4 for titles and Source Sans 3 for
  everything else; subject colours Numeracy monsoon, Language bark, Arts haldi, fixed sand. All in `tokens.json`.
- One navigation: Today, Timetable, Children, Setup on one slim bar; a trail; a rail with Connected to and Capture here; no
  sidebar. The K2 side menu goes.
- The assessment loop is rebuilt on the same parts; its queries and its seven steps are unchanged.
- No ranking of educators anywhere. No graph database. No parent login. A child's name shows only where screens.json marks a `child_name` element (read from `pii` by `child_id`); every fixture, test and baseline uses fake names because the repository is public; no child photo except the child's own page as photographed.
- The site's words are rows (`STATES`, `state_colour`, `voice-words.ts`); a screen never types a state word or an icon name.

**How to proceed**

1. For each slice in `scopes.md`, in order UI-1 (tokens) → UI-13 (the frame and the inventory test) → UI-2 (blocks) → UI-3 and UI-4
   (either order) → UI-5 → UI-6 (timetable, rules, fortnight; when its backend has merged) → UI-7 → UI-8 → UI-9; UI-11 any
   time after UI-2; UI-12 any time after UI-13; UI-10 (the as-built document) right after UI-13: open a GitHub issue titled `UI-n: <title>` with the section's text verbatim; Nimish adds
   `scope-locked`; run the `athena-scope` skill (the proof-writer turns every Done-when line into a check, including the
   ten generic checks for each screen the slice builds, read from `screens.json`); build with `athena-build` test-first;
   verify with `athena-verify`; ship with `athena-ship`. One slice at a time; merge under the merge rule.
2. UI-13's inventory test, `apps/web/tests/u70-inventory.spec.ts`, is the spine. It reads `screens.json`; for every screen
   of a slice in `merged_slices` (or named by `SLICE=UI-n`) it signs in as educator and as coordinator, opens the screen at 1440 and 400 (dynamic
   routes take a concrete address from `tests/inventory-fixtures.ts`, built from the suite's own rows), runs the ten
   generic checks of SPEC §7, and then drives every control in the screen's `elements` list by its kind
   (`element_kinds`): clicks every link and row and asserts it lands on the target's h1 and that Back returns; opens and
   closes every fold; applies and clears every filter and checks the address; fills every field and submits every button
   and asserts its stated effect; and asserts that controls marked for one role are absent and refused for the other.
   Its completeness check counts the interactive controls on the page and fails if the count differs from the inventory.
   A screen whose slice is not merged is `test.fixme`. Every slice's last commit adds its id to `merged_slices`.
   (`exists` only describes the old page; every screen belongs to exactly one slice, UI-1 to UI-13.)
3. Build nothing that is not in the inventory. A new screen or control goes into `screens.json` first, the script is
   run, and the test fails until the screen exists. That is how there is no rework.
4. Every block gets a preview on `/setup/blocks` and a screenshot in both themes (UI-2); every slice gets its journey test
   with axe (named in its scope). Server components by default; client code only for the class grid's tap, the recorder
   and the details folds.
5. Report to Nimish in plain English after each merged slice: what a person can now do, what the proofs showed, what is
   next. No code, no file paths unless he asks.

**Known gaps you will meet**

- `activity_observation.session_id` is still free in the database (the K2 plan migration says "next slice"); the period
  → note link in UI-3 needs it. Orchestrator 4 holds it; ask before adding a scope.
- The K2 screens are behind a config switch in production ("Voice notes are not switched on"); UI-3's proofs run with the
  switch on in the test database; turning it on live is Nimish's step.
- The live What-needs-doing badge counts 109 English skills to approve; UI-7 moves that count to Setup › Curriculum.
- The contrast table in `docs/design-tokens.md` was measured on paper-warm; UI-1 re-measures on white and commits the table.
- Lucide icon names in the design system's README that are not yet in `lib/icons.tsx` must be checked against the
  installed `lucide-react` before use.

---

## The files, for the record

| File | What it is |
| --- | --- |
| `docs/frontend/SPEC.md` | the consolidated specification (generated from the two below plus `spec-head.md`) |
| `docs/frontend/screens.json` | the inventory: groups, blocks, element kinds, generic checks, slices, the bar, 34 screens with every control |
| `docs/frontend/spec-head.md` | the written part of the spec (sections 1 to 5 and the frame of 6 and 7) |
| `docs/frontend/build-spec.mjs` | regenerates SPEC.md, scopes.md and the wireframes page; refuses an inventory with a dangling target |
| `docs/frontend/scopes.md` | the slices as paste-ready Scope-form issues |
| `docs/frontend/tokens.json` | the tokens, the repository's copy of the design system's |
| `docs/frontend/HANDOVER.md` | this file |
| `docs/notes/frontend-vision.md`, `-mindmap.md`, `-walkthrough.md`, `-landscape.md` | the four passes, for the reasoning behind the decisions |
| `docs/decisions/2026-11-09-*.md` | the white ground; the type and subject colours |
