# Wireframe batch 4: the 17 remaining screens

Branch `wireframes-batch-4`. Docs only: no app code, no schema. Screens: staff, classes, setup, curriculum,
skills-approve, bank, question, timetable, fortnight, draft, moves, rules, materials, reports, login, help, feedback.

## Verified
- `node docs/frontend/wireframes/check.mjs`: all 32 wireframes PASS, 28 blocks drawn once, all clear. `--gaps`: all clear.
- Rendered at 1440 and 400 (light) with Playwright: no sideways scroll of the page at either width. Not run: dark theme, the app.

## Fixed on the way (root causes)
- `schema.mjs` read a `--` inside a quoted SQL literal as a comment ("engine load --check" in a column comment), which cut
  the literal's closing quote and hid every later statement of `cp27_last_tables.sql`; `check.mjs` was holding wireframes
  to a schema without `capture.page_prints`, `skill.question_kinds`, `material_item.aliases`. The scan is now string-aware.
  (Tables that migration drops inside a dynamic `execute format(...)` still look present to the replay; none is a target
  table, so `check.mjs` already refuses them in a `data-source`.)
- `provisional.json` listed `fortnight.state` (now built) and `item.key`, `item.review`, which #551's later revision replaced
  with `item.item_key` + `change_log`, and `eval_case` rows. Removed; DATA-GAPS.md's two rows say so.

## Data
- 0 new tables (#551). A child's class and roll are the open `enrolment` (`enrolment.roll_no`, `school_class.label`; the view
  `child_now` reads them). A week is a date. The sign-in list is `pii.staff`.
- New gaps (DATA-GAPS.md "batch 4", and one comment on #551): a child's report lines and their words, a report's sent time,
  what a hand move edits on a drafted fortnight, where the materials photo and the feedback screenshot are kept.

## Judgement calls (Nimish to confirm)
- **Setup no longer shows the "109 waiting" count** on its Skills to approve card: `skills-approve.done_when` says its eyebrow
  is the only place that number appears, and `setup.blocks` asked for a count. One of the two lines in `screens.json` should
  change; the wireframe follows the testable one.
- **No Table | Board toggle and no ChildPeek where the screen's elements list none** (as batch 3): curriculum, fortnight and
  reports draw the board below the table with cards that are not links (curriculum's cards reuse the "Drafts to check" link);
  classes and reports have no peek. Adding them means new elements in `screens.json`, which the site's inventory test reads.
- **Forms whose fields are not elements are drawn as read-only insets**: staff's Add a grant, classes' Move, rules' Edit and
  Add a rule, login's forgot-password panel.
- staff rows are grouped by role with counts; the three numbers are plain figures, no colour, no sort.
- timetable is drawn in Week view (Day on a phone, one markup for both); "Open today" reuses the rail's today's-period link.
- fortnight is drawn approved, not yet live: Go live is the main action, Approve an ordinary button in an inset.
- draft: the grid is the run's own draft, not live sessions; Make a draft still shows on the phone frame (one markup).
- moves: cells are buttons (pick, then place); the educator's read-only view is described, not drawn.
- materials: lines grouped into To confirm and Set with counts; no filled button (the main action is filling quantities).
- login is left-aligned (the kit has no centring block); help is drawn as opened from Today's ?.
