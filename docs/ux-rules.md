# UX rules for the educator's site

Approved by Nimish, 2026-10-22. Held by tests (below); the pages that still break them are listed in `workflows.json`
under `ux.frozen`, and the list only shrinks.

## Desktop first, and the phone gate (UI-13, 9 Nov 2026)

Educators use the site on a desktop, so every screen is designed, tested and screenshotted at **1440 px** (not 1280, which
was the K2 screens' width until UI-13). A phone (400 px) must not break: every screen passes a smoke test there (it
renders, one h1, no console error, no sideways scroll of the page). The screens marked `phone_gate` in
`docs/frontend/screens.json` are held to more at 400 px: the same order, controls of at least 44 × 44 px with 8 px between,
the keyboard, and the words; a page's heading sits within the top 240 px (the 64 px bar, the door's row of pages and the
trail come first). KG observation (S9) is done on a phone and is such a screen.

**Four work states, not five chips.** Work is one of green (done), amber (to confirm, waiting on someone), red (do now,
late, a fix) or a quiet grey (to do), each an icon, a word and a colour (rule 10), taken from the STATES rows in
`apps/web/components/status-chip.tsx`. A child is a square cell and is never red: not seen is a dashed, untinted square. A
mark is an icon first (above ▲, below ▼, not willing a hand, absent a dashed ring). Nothing is ticked for her. The words
are in `apps/web/lib/voice-words.ts` and every icon in `apps/web/lib/icons.tsx`, the one icon file.

## The eight rules, and three more for the desktop

1. **One purpose, one main action.** The title says what the page is for; one main action; the page ends on a link to
   the next step. No dead ends.
2. **One table style.** The same columns, date and number formats, status chips and words everywhere.
3. **No long tables.** At most 10 rows shown (`TABLE_ROW_LIMIT`). More are grouped by week or class, or paged, with
   what needs the educator first.
   *Not a table:* a class's grid (the ClassGrid block: each child a square cell by Sr. No., today
   `app/(app)/voice/board.tsx`) shows the whole class at once and is never a `<table>`: eight columns at 1440 px, three on a
   phone. She marks children by tapping them, and a class paged ten at a time hides the child she needs (task M1-04, the
   agreed K2 design, 3 Nov 2026).
4. **No empty noise.** No column of zeros or dashes, no empty chip, no line under the title over 140 characters
   (`PURPOSE_MAX`).
5. **One count, one meaning.** Computed once, the same on every page and in the menu. Only What needs doing (once Today) has a count.
6. **The school's words.** Educator, regroup, Easy/Medium/Hard/Advance. No taxonomy, rung or kind on an educator's screen.
7. **Phone and desktop.** Desktop first at 1440 px (above). On a phone the four doors are a tab bar at the foot (icon above
   word, 44 px or taller, the chosen door's icon in brand clay and its word in ink), the bar keeps the mark, the search and
   the person, and a table scrolls sideways in its own box or becomes a list; it must not break there. A screen marked
   `phone_gate` also passes the phone gate list above.
8. **Setup out of the way.** Statistics, question counts, old scans and reader statistics sit behind a "details" link.
9. **A list is a table, and a table has its filter row.** Rows and aligned columns: subject, class, grade, status and the
   like are columns, never tags floating in a line. Text is left, numbers right, a status centred, each column the same
   width on every page of its kind; the head stays at the top and a row lights under the pointer. Six rows or more have a
   `FilterBar` above them, in the same place on every page: dropdowns (class, subject, grade, status, week, as fit), a
   compact search, the filters that are on shown beside them with a × each, and one click to clear them all.
10. **A status is an icon, a word and a colour.** Never colour alone. One chip (`StatusChip`), one map of the school's
   states to green (done, right), amber (waiting on someone or something) and red (needs the educator now), and a quiet
   grey for a state with nothing to do. Red is rare. A state is added to `STATES` before a page uses it.
11. **The bar is for getting around.** One bar across the whole screen, 64 px high, and no sidebar (the rail beside a page
   holds what is connected to it, never the menu): the school's logo (BrandMark, a link to Today), the four doors (Today,
   Timetable, Children, Setup, each with its icon; Setup is every member of staff's while `mayUse(me, "setup")` says so, and
   the coordinator group's alone once the roles split), the search, acting as (the coordinator's), help and sign out. Under the bar sit the pages of the lit door. The one count in the site is on Today.
   The search is a typeahead of at most five suggestions with no results page; what is typed travels in a POST body, never
   in an address or a log. Everything in the bar is at least 44 px tall. Nothing in a shared block or the bar names a
   subject. The door lit is the door the walk started from. Above a page's title is its trail: the door, then the thing,
   and the browser's Back for the rest. A control whose target screen is not built is not drawn (`lib/built.ts`).
12. **A person sees their own.** What a person sees is what their staff row names: its classes and subjects, every class when
   none is named. Each page carries its own filters (`FilterBar`) for what only it needs, starting at that scope. A view,
   never a permission (`lib/viewing.ts`, `lib/access.ts`). **Acting as** replaces the old "Viewing" control: a coordinator
   can look at the site as an educator sees it (the switch in the bar); it changes what is shown, never what is allowed.
13. **No approve-all.** An approval is a row's own action on its own item. No page offers one button over every row
   (`apps/web/tests/u62-scope-and-todo-logic.spec.ts`; the pages that still do are `ux.approveAll` in `workflows.json`).

## The educator's week, and its pages

| Day | Step | Page (menu item = page title) |
|---|---|---|
| Wednesday | see what waits | Today |
| Wednesday | say what was taught | What needs doing (a topic is marked taught in its own row) |
| Thursday, Friday | approve | Assessments (an assessment's pack, approved on its own screen) |
| Friday | print, give, follow | Assessments |
| Monday | papers come back | Upload papers |
| Monday | settle what the reader was not sure of | Assessments (the child's paper: each answer, then sign it off) |
| Monday | read the class | Children (the class picture, and a child) |
| Setup, apart | | Curriculum; Question bank |

The menu is four doors on the bar (`apps/web/lib/menu.ts`; the old side menus are gone), and the table above is how the week
runs through them. A page's door is the `group` of the screen that replaces it in `docs/frontend/screens.json`; its pages are
a row under the bar:

| Door | Its pages (the row under the bar) |
|---|---|
| Today | Today (`/today`: the periods, the strip of what waits, which carries the one count); Notes |
| Timetable | Materials, Timetable, Timetable rules |
| Children | Children (the class pictures), Assessments, Upload papers, Parent reports, Across classes |
| Setup | What needs doing, Curriculum, All the curriculum, Skills to approve, Bank of questions, Question bank, Staff, School, How it works |

Help, the Guide, Report a problem and the password sit outside the bar: the "?" and the person in the bar, and a link at the foot.
The lit door and page are marked, no word of the menu names a subject. Held by `apps/web/tests/u53-the-menu.spec.ts`.

## The blocks (`apps/web/components/`)

| Block | Use it for |
|---|---|
| `Screen` (`components/app-frame.tsx`, inside AppFrame) | Every page. Props: `stage`, `title`, `purpose` (one line, 140 characters at most), `action` (the one main action), `next` (the next-step link), `details` (optional link to setup and numbers), `rail` (optional: what the page is connected to, and Capture here). `action` and `next` are required, so a page cannot leave them out. |
| `DataTable` | Every table. Props: `columns` (with a `value` for each cell, which is what empty-column hiding reads), `rows` (needs-you first), `rowKey`, and `more`: either `{ by, href? }` to group, or `{ page, href }` to page. `more` is required, so a table that can pass 10 rows always has a way to the rest. A column says how it aligns (`num` right, `status` centred, else left) and may fix its `width`. `extras` adds a row's data attributes and a full-width row under it (an assessment opened to its copies). On a phone it is a list of labelled cards. |
| `StatusChip` | A state in a row or a heading: icon, word, green, amber or red. The states, words and tones are in `STATES`; add one there first. |
| `FilterBar` | The filter row over a table: `filters` (a dropdown each: name, label, value, "all" words, options), `search`, `keep` (what the page holds while filtering). A GET form: the filters are in the address. |
| `EmptyState` | Nothing to show. On a `Screen` page the shell supplies the next step. |
| `Count` | A number of things waiting. Give it the same `of` and value wherever it appears; the bar's badge carries the same `data-count`. |

Rules and constants: `apps/web/lib/ux-rules.ts`; the menu: `apps/web/lib/menu.ts`. The frame (bar, trail, rail, bottom doors) is `AppFrame`; the inventory test that drives every screen is `apps/web/tests/u70-inventory.spec.ts`. The first page on the blocks is `/capture/check`; copy it.

## How the build holds the rules

- `packages/engine/tests/test_ux_rules.py` (in `bin/check`, no database): a page not on the list must be built on
  `Screen`, have no hand-built `<table>`, and no `sub=`/`purpose=` over 140 characters; a page on the list must
  still break exactly what it lists.
- The same test holds rules 9 to 11: a page with a hand-drawn `chip` is a tag list (`taglist`), a table with no `FilterBar`
  has `filter`, a `<Pill>` or `<MarkPill>` drawn by hand is a status with no icon (`status`); `StatusChip` cannot draw a
  state without its icon; the bar's sizes are read from `lib/ux-rules.ts` (`BAR_HEIGHT_PX`, `TOP_BAR_MIN_PX`,
  `SEARCH_PX`). A rule written down for the first time lists the pages that break it once (`ux.rules`); after that it
  ratchets like the others.
- `engine ratchet` (CI): nothing joins `ux.frozen`, no rule comes back to a page that kept it.
- `apps/web/tests/u51-ux-rules.spec.ts` (browser): each page as it renders: a table over 10 rows, a column of zeros or
  dashes, a count that differs from the menu's, no main action or next step, a line over 140 characters, a table of six rows with
  no filter row, a status with no icon; and the bar's sizes. A page not on the list must keep all of them.

## Taking a page off the list

1. Build the page on `Screen`, and its tables on `DataTable`.
2. Delete its entry from `ux.frozen` in `workflows.json` (the test fails until you do, and fails if you do not).
3. Run `bin/check` and `cd apps/web && npx playwright test tests/u51-ux-rules.spec.ts`.
4. Note it in the branch's `docs/notes/<goal>.md`.

Not yet held by a test: rules 6 and 8 are reviewed by eye.
