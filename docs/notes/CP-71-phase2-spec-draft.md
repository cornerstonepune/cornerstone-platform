# DRAFT for the orchestrator: CP-71 Phase 2, the picker with sequence, and "Fill it in for me"

Not an issue yet and not approved. Source: `docs/notes/CP-71-timetable-builder-design.md` sections D, E4, F7, G (Phase 2). Phase 2 is **not started**; it waits
for Nimish's approval, recorded on its issue by the orchestrator (standing orders, "Approvals are recorded on the issue"). Suggested title:
`CP-<n>: choose what is taught, in order, and fill the timetable in for me (CP-71 Phase 2)`. Split into two issues if the orchestrator prefers (A: picker, B: solver).

## What

An educator opens one of her lessons and is offered the objective to teach next, in order, with the activities linked to it; she can plan a whole
subject for the fortnight in one go, or repeat last week. A coordinator can press **Fill it in for me** on the Build page: code places the lessons
still to place under the rules, keeps every cell a person set, changes as little as it can, and explains what could not be met. The solver
(OR-Tools CP-SAT) sits in one adapter file; code checks every answer before it is shown.

## Done when

Part A, the picker (ranking, spread and "same as last week" are pure functions, tested without a database):

1. Given a class whose last past Maths lesson has objective X, `offers` returns as *Next up* the objective after X in order within X's unit, and X's unit's
   remaining objectives as tier 2 in order.
2. With no last-taught objective, `offers` returns the whole subject, units in order, one-off units last, no retired objective.
3. Within a tier, a not-yet-taught objective with an activity ranks above one without, above one already taught.
4. `spread` of k objectives over n lessons gives each `n // k` lessons and the first `n % k` one more when k <= n; when k > n the first n get one each and
   the rest are listed as left over; holidays and fixed lessons are skipped.
5. "Same as last week" copies objective and activity from the lesson one week earlier, and refuses, saying why, when there is none.
6. The suggestion job fills only lessons with no objective or a machine-made one, and a second run changes nothing.
7. A lesson a person set is unchanged by the suggestion job, by `spread` on other lessons, and by a re-publish.
8. The picker, at 400 px, passes the phone gate (controls at least 44 x 44 px, the same order, the keyboard, the words).

Part B, Fill it in for me:

9. `solve` on the fixture school places every needed lesson with no Must problem, keeps every person-made cell where it was, and gives the same answer twice
   with the same seed.
10. `solve` on a fixture that cannot be met returns `unmeetable` with at least one rule named in words, and writes nothing.
11. An answer that breaks a Must rule (injected in the test) is discarded and recorded as a failure in `timetable_run`.
12. The existing CP-11 generator proofs pass with the new adapter in FET's place (FET stays installed until they do).
13. The Build page's Fill button shows the result as a preview the coordinator accepts or discards, and accepting is one change that Undo reverses.

## Schema (one migration, alone; the table budget does not move)

Read against `docs/data-model.md`. No new table. Three columns, each argued in the design (D2, F2):

| Change | Why it cannot be less |
|---|---|
| `session.lo_code` (links to `learning_objective`) | A lesson's objective exists nowhere today; an activity link cannot stand in, since a Grade 1 to 4 lesson may have an objective and no activity. |
| `session.source` (`machine` or `person`) | Who chose must sit on the row a later job would overwrite; `change_log` is too indirect to gate a write. |
| `learning_objective.ord` (int) | No teaching order exists; `topic.ord` cannot serve while no objective has a topic (none does today). Seeded once by code from the source order, marked machine-made. |

Also: the engine gains the dependency `ortools` (Apache-2.0) and one file, `adapters/cpsat.py`, the only one that names it (ring C).

## Out of scope

What-if copies, cover for an absent educator, parent views (Phase 3); a model choosing the order or the placement (a model may only propose a teaching order
that code checks and a coordinator accepts, later); rooms; loading Grades 1-4 from the old sheets.

## Open points, to be settled before approval

- **The teaching order is an inference.** Code order equals teaching order was read from one subject (Grade 2 Maths) only. Before the picker trusts it, a
  coordinator looks at that subject for five minutes. If wrong for a subject, that subject opens on "all of the subject" until someone orders it.
- **Solver time is an estimate** (well under 5 s for a few thousand variables), not measured. The existing `timetable.solve_seconds` row is the ceiling.
- **Last taught** counts a past lesson nobody marked as "not confirmed", with one tap for "did not happen" (design decision 3). Confirm Nimish agreed.
- **Who teaches** must be on record for the educator checks to bite; today most Grade 1-4 subjects have no named educator (the checker says so, never a silent pass).
- **Specialists** (`timetable.specialists`) are still empty; the solver would read the same row.
- **Size:** the design estimates 7 sessions for Phase 2; a split into two issues would let the picker ship alone.
