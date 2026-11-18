# CP-75: "Fill it in for me" places the lessons under the rules (CP-71 Phase 2B: the solver)

Issue #868. Approved by Nimish, 17 Nov 2026 (same words as CP-74, recorded on the issue). Depends on CP-74 (no schema change of its own).
Design: `docs/notes/CP-71-timetable-builder-design.md` sections E4, F7, F8, G. This file is the issue's text.

## What

A coordinator presses **Fill it in for me** on the Build page: code places the lessons still to place under the rules, keeps every cell a person set,
changes as little as it can, and says in words what could not be met. The solver (OR-Tools CP-SAT) sits in one adapter file (`adapters/cpsat.py`, ring C);
code checks every answer before it is shown.

## Done when

1. `solve` on the fixture school places every needed lesson with no Must problem, keeps every person-made cell where it was, and gives the same answer twice with the same seed.
2. `solve` on a fixture that cannot be met returns `unmeetable` with at least one rule named in words, and writes nothing.
3. An answer that breaks a Must rule (injected in the test) is discarded and recorded as a failure in `timetable_run`.
4. The existing CP-11 generator proofs pass with the new adapter in FET's place (FET stays installed until they do).
5. The Build page's Fill button shows the result as a preview the coordinator accepts or discards, and accepting is one change that Undo reverses.

## Out of scope

What-if copies, cover for an absent educator, parent views; a model choosing the placement; rooms.

## To settle before building

- Solver time is an estimate (well under 5 s for a few thousand variables), not measured; the existing `timetable.solve_seconds` row is the ceiling.
- Specialists (`timetable.specialists`) are empty; the solver reads the same row, so Nimish's list is needed first. Build it to read the row and to say
  plainly in its result when the row is empty.
