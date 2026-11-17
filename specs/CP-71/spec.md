# CP-71: coordinators build the timetable in the portal (Phase 1: pattern, paint, checker, rules panel, publish)

Issue #838. Approved by Nimish in chat on 17 Nov 2026 (recorded on the issue). Design: `docs/notes/CP-71-timetable-builder-design.md`.
This file is the issue's text, plus the three things the first session settled in writing (the last three sections).

## What

Phase 1 of the timetable builder: a coordinator builds each grade's two-week pattern in the portal (no solver yet). Scope: the Build page
(its own route, `/timetable/build`); start a class from another class's day shape; paint, fill a period every day, copy week A to B, copy
from a class; the checker with plain sentences and computed fixes; the rules panel (existing kinds, plus "most in a day", educator
availability and the educator clash); publish; undo.

## Done when

1. A class with no periods, given "start from" another class, has that class's periods and fixed rows on every weekday of weeks A and B, and nothing else.
2. One `pattern/change` call with 12 cell changes writes all 12 or none, and returns an inverse that, applied, leaves the pattern equal to what it was.
3. "Fill this period every day" and "Copy week A to week B" each produce the expected cells and never replace a `fixed` cell.
4. A pattern change dated from a fortnight leaves every lesson of an earlier published fortnight unchanged.
5. Two classes given the same educator at overlapping times produce exactly one `educator` problem whose sentence names both classes, the day and the times; non-overlapping times produce none.
6. A subject over its "most in a day" produces a Try to problem that does not stop publish; over its weekly most produces a Must problem that does.
7. Every fix offered for a problem, when applied, removes that problem and adds no Must problem.
8. Publish writes one lesson per non-empty pattern cell per school day of the fortnight, none on a holiday, and is refused with its sentence while a Must problem is open and not allowed.
9. A person outside the coordinators' group is refused by every write endpoint and can read the pattern.
10. A period layout with a `valid_to` is not offered for a date after it.
11. The Build page at 1440 px has one h1, one main action, the panel folds and unfolds by keyboard, and at 400 px renders with no sideways scroll and no paint controls.

## Out of scope

The objective/activity picker and "Fill it in for me" (Phase 2); what-if, cover, parent views (Phase 3); loading Grades 1-4 from the old
sheets (on hold, by Nimish); rooms.

## Needed from the school (data, not code)

A Grade 4 class row; which educator teaches which subject in each of Grades 1-4; each grade's period times; the specialists' days.

---

## Settled in session 1 (engine first)

### S1. A lesson's head for Grades 1-4 is the subject table's code (config rows, no mapping in code)

K2 keeps its own short heads (`math`, `story`, `music`...), the rows already in the setting `timetable.heads`; nothing about K2 changes.
For Grades 1 to 4 a lesson's head (`session.subject_code`, and the `subject_code` of a pattern cell) **is** the subject table's code
(`NUM`, `HIN`, `MAR`, `SCI`, `GP`, `HSC`, `COM`, `ART`, `MUS`, `GMS`, `FMS`, `PE`, `ENG`).

- Each such head is one more row of `timetable.heads` (`code` = the subject code, `label` = the subject's label, `groups` = the school's
  spellings that spell that code in `curriculum.subjects`), seeded in `supabase/seed/config.json`. The two lists are the school's rows;
  no code holds a pairing.
- `tt_heads.heads_in` already turns a head into a subject through those spellings, so nothing in code changes: a `NUM` head with group
  "Maths" resolves to `NUM`, and the K2 head `math` (group "Maths") resolves to `NUM` too. The picker (Phase 2) joins objectives to lessons
  on that one answer.
- Their colours are rows of `timetable.subject_looks`, as K2's are.
- A fixed row (assembly, lunch, fruit break, dispersal) carries no subject, as today.
- A test holds it: every `timetable.heads` code that is not a K2 head is a `subject` row, and `heads_in` of each resolves to itself.

### S2. The one schema change of Phase 1 (migration `20270202090000_cp71_pattern_rules.sql`)

Nothing new as a table; the table budget does not move. Each addition and why it cannot be less (read against `docs/data-model.md`):

| Change | Why it cannot be less |
|---|---|
| `period.valid_from`, `period.valid_to` (dates, empty = always) | A year holds two to three day shapes; a period has no dates today, so a second shape would show beside the first. A rule's own `valid_from`/`valid_to` cannot say it: periods are shared by every class of the grade. Done when 10. |
| `period` unique key widened to include `valid_from` (nulls not distinct) | Two shapes may keep the same start time with a different length (assembly 08:30 to 08:45, then to 08:40). The old key allowed one row per start time. |
| `timetable_rule.source` (`machine` or `person`, default `person`) | Copy and, later, the solver write `machine`; a paint or edit writes `person`; the solver pins every `person` cell. It must sit on the row a later job would overwrite (design F6). Existing rows are the school's own and become `person`. |
| `timetable_rule.staff_id` (links to `staff`) | A rule about an educator (is away on a weekday or period) needs the person; nothing else on the row can hold it. Never a name (data model: "Who did it"). |
| `timetable_rule.weight` (integer, empty = Must) | Must versus Try to is one fact per rule; a number says Try to. The numbers come from config (`timetable.weights`), not the coordinator. |
| kind `away` and span `day` added to the existing checks | New rule kinds are rows of the one rules table (the data model's rule); "at most N of one subject in a day" is a `limit` with span `day`. |
| `school_class_id` may be empty on an `away` rule only | An educator's days are not one class's. The row check keeps every other kind tied to a class. |

**Left out of the design's section F on purpose** (Phase 1 does not use them; a later migration adds them when a phase needs them):
`timetable_rule.other_subject_code` and kinds `after` and `share` and span `run` (their rules are not in Phase 1's scope), and the change to
the `timetable_clash` view (the educator clash is found by the checker `tt_check`, in code, over the pattern; the view has no reader that
needs it). Row-level security: no new table, so no new policy; the existing policies of `timetable_rule` and `period` cover the new columns.

### S3. Who may write, who may read

Every write door of the builder (`pattern/change`, `pattern/copy`, and the later `publish`) asks `tt_live.in_group` with the setting
`timetable.go_live_group` (the coordinators), so the coordinators' group is one setting and the same one that already guards go-live.
A sign-in on the staff list outside it may read the pattern and is refused (403, one sentence) on every write; one not on the staff list is
refused everywhere, as the rules door does.
