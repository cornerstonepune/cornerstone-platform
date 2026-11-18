# CP-74: educators choose what to teach next, in order (CP-71 Phase 2A: the picker)

Issue #867. Approved by Nimish, 17 Nov 2026, in chat (recorded on the issue): "You should really start phase 2 of the timetable. I thought that you
would have built that, and the timetable was like one comprehensive release. If that is not done, the solver and the picker are the very critical part
of the timetable experience, so go ahead and build it fast using fable." Design: `docs/notes/CP-71-timetable-builder-design.md` sections D, F, G.
This file is the issue's text.

## What

An educator opens one of her lessons and is offered the objective to teach next, in the school's order, with the activities linked to it. She can plan a
whole subject for the fortnight in one go, or repeat last week. Ranking, spread and "same as last week" are plain code (no model, no solver).

## Done when

1. Given a class whose last past Maths lesson has objective X, `offers` returns as *Next up* the objective after X in order within X's unit, and X's unit's remaining objectives as tier 2 in order.
2. With no last-taught objective, `offers` returns the whole subject, units in order, one-off units last, no retired objective.
3. Within a tier, a not-yet-taught objective with an activity ranks above one without, above one already taught.
4. `spread` of k objectives over n lessons gives each `n // k` lessons and the first `n % k` one more when k <= n; when k > n the first n get one each and the rest are listed as left over; holidays and fixed lessons are skipped.
5. "Same as last week" copies objective and activity from the lesson one week earlier, and refuses, saying why, when there is none.
6. The suggestion job fills only lessons with no objective or a machine-made one, and a second run changes nothing.
7. A lesson a person set is unchanged by the suggestion job, by `spread` on other lessons, and by a re-publish.
8. The picker at 400 px passes the phone gate (controls at least 44 x 44 px, same order, keyboard, the words).

## Schema (one migration, alone; no new table)

Read against `docs/data-model.md`. Three columns, each argued in the design (D2, F2): `session.lo_code` (a lesson's objective exists nowhere today; an
activity link cannot stand in, since a Grade 1 to 4 lesson may have an objective and no activity); `session.source` (`machine` or `person`; who chose must
sit on the row a later job would overwrite); `learning_objective.ord` (no teaching order exists; `topic.ord` cannot serve while no objective has a topic;
seeded once by code from the source order, marked machine-made).

## Out of scope

The solver (CP-75); what-if copies, cover for an absent educator, parent views (Phase 3); a model choosing the order; rooms; loading Grades 1 to 4 from
the old sheets.

## To settle before building (Nimish)

- Teaching order is the school's source order, read as right from one subject (Grade 2 Maths) only. A coordinator looks at that subject for five minutes
  first; for a subject that is wrong, the picker shows "all of the subject" until it is ordered.
- "Last taught" counts a past lesson nobody marked as taught, with one tap for "did not happen" (agreed in the design, decision 3).
- Educators: most Grade 1 to 4 subjects have no named educator; the checker says so and never passes silently.
