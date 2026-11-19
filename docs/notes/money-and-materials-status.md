# Money & Materials: the one map, and where each slice stands

Read this first for this work. It says what is being built, in what order, what you can see on the screen at each step, and
which document each step comes from. Update the table when a slice merges (not before).

## The documents, in order of authority

1. `docs/notes/money-and-materials.md`: the brief (D-077, D-078). The roadmap rows MM-0 to MM-11 and the real-data scenarios
   are in it. It is a public copy; the private original in `teacher-os` wins where they differ, and this build has not been
   able to read that original, so any starting value in D-077 that is not in this copy is unconfirmed.
2. `docs/notes/standing-orders.md`: Nimish's standing decisions. `CLAUDE.md`: how work is done. `docs/data-model.md`: reuse
   before adding a table. `workflows.json`: the map the code must follow.
3. `specs/CP-<n>/spec.md` and its GitHub issue: one per slice, with *Done when* lines a test can check.

## The flow, in one picture

**Money.** An educator buys something, uploads the bill photo and types the entry. The campus operations lead approves or
sends it back. A founder pays it and records date, mode and reference. The educator sees every step in words. Rules
(limits, who approves, who pays) are settings the founders change. History is never edited.

**Materials.** Each activity names what it needs. The catalogue holds the items. Each class's list for a fortnight turns
the plan into items; the school's list adds the classes up. A campus's store holds stock. **Buy list = what the classes
need − what is on hand + what is below its minimum.** The purchase is a money claim. When it arrives it becomes stock.
Stock goes out to classes. A termly count keeps the numbers honest.

**Where the two meet:** the buy list makes a purchase; the purchase is a claim; the received claim is stock.

## The slices (each one is something you can open and use)

| Slice | What you see | Brief row | State |
|---|---|---|---|
| A. Set up | Two campuses, a founder role, classes placed on a campus | MM-0 | merged (CP-76) |
| B. Rules, claims, approve, pay | **Money** menu: My claims, File a claim, To approve, To pay, Rules | MM-1 to MM-3 | merged (CP-77 to CP-80) |
| C. History | The school's 1,301-line expense sheet as "Earlier record" claims | MM-0 | merged; the import itself needs a run on live (CP-81) |
| D. Catalogue | Items split from 1,423 activity notes, reviewed on the curriculum review screen | catalogue | code merged-ready (CP-83); the live run needs a person with live access |
| E. Stock and the buy list | **Stock** menu: On hand, Buy list, Count | MM-9 | built, in review (PR 905, CP-82); nothing seen against a real catalogue yet |
| E2. One list of materials, with categories | Catalogue page and an item picker: pick, or add with name, unit, category; "pencil" and "PENCIL pencils" are one item | catalogue | engine in build (CP-84); screens next (CP-84b); alternatives "or" (CP-85) |
| F. Purchase meets stock | A claim says which catalogue items it buys; "received" puts them into stock | MM-9 | next |
| G. Hand-out from the class list | An educator taps "collected" on their own list; stock falls | MM-9 | next; some sessions carry no activity yet, which limits requisitions from the timetable |
| H. Floats | Each operations lead's petty-cash balance, month-end close | MM-4 | not started |
| I. Event budget | Sports Day (5 and 12 December) budget set before spend | MM-7 | not started; the brief wants it confirmed by 1 December |
| J. Exceptions and the monthly report | Nightly flags and a report on the 3rd | MM-5 | not started |
| K. Vendors and recurring bills, capex to asset | Tanker, garbage, tea; assets with a QR | MM-6, MM-8 | not started |
| L. Count and the annual buy draft; dashboards | Termly count; budget vs actual | MM-10, MM-11 | not started |

## Dates in the brief

The brief wants MM-0 to MM-4 and MM-7 live by **31 December 2026** (December runs beside the current sheet; from 1 January
2027 this is the only record). It also lists materials last, because the catalogue was empty. Both are true at once; the build
runs two lanes (materials, and the dated money slices) rather than one after the other.
