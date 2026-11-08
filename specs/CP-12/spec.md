# CP-12: The timetable by hand

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/460 (DRAFT for Nimish. Not locked.)

Waits for CP-21 (a draft goes live, issue #496; split agreed by Nimish, 8 Nov), and through it CP-11 (the generator), CP-6 (the fortnight cycle) and CP-4 (the access table list). Plan: docs/backend-plan.md. Roadmap task M1-14. Tier 3 (data change). Design: specs/CP-12/design.md.

## What

Once a fortnight's timetable is live, a person can move a lesson by hand or swap two. Every move is kept with who made it, when, from where, to where and why. The system lists every clash in a fortnight (a lesson on a blocked day or period, a subject above its most or below its fewest) and a person can accept a clash with a reason. The fortnight (weeks A and B, including a 15-day fortnight) is the unit: a move, the clash list and every count are per fortnight.

## Done when

1. A lesson can be moved to another day or period of the same fortnight, or swapped with another lesson. Each move is kept with who, when, from, to and the reason given; the history cannot be changed or deleted. (Test.)
2. A move changes only the fortnight it was made in; the same lesson in the fortnights before and after stays where it was. This holds in a 15-day fortnight too. (Test.)
3. After a move, the educator's day shows the lesson in its new place with its plan line and its materials lines. A fixed lesson, a move to or from a day already past or a holiday, or a lesson already marked done or not done cannot be moved, and the refusal says why and writes nothing. (Test.)
4. Each fortnight's clashes are listed with their kind, fortnight number, week and the lessons involved, for each kind: a lesson on a blocked day or period, a subject above its most or below its fewest in a week or the fortnight. Moving a lesson back removes its clash from the list. (Test, one per kind.)
5. A person can accept a clash with a reason; who and when are kept. An acceptance covers only that clash: if a lesson in it moves again, or its limit changes, the clash is listed as not accepted. (Test.)
6. A fortnight with a clash nobody accepted cannot be approved, and in an approved fortnight a move that would leave a clash nobody accepted is refused. This is a setting per school, on by default. (Test.)
7. In a frozen fortnight, a move without a reason is refused and a move with a reason is kept. (Test.)
8. LIVE: the move history and clash acceptance exist with role rules on; the clash count per fortnight is printed (read-only, counts only, no names). The existing website pages and engine tests pass unchanged.

## Out of scope

Putting a generated draft live, and refusing to overwrite hand moves when a new draft goes live (CP-21). The generator itself (CP-11). "The same adult in two places": not needed while nursery to K2 have one educator for all lessons; it becomes relevant for grades 1 to 4 (subject educators) and is added then, with no table redone (see design). Rooms. Any screen (the month and quarter calendar, drag to move). One-day changes such as a substitute or a cancelled lesson. Making a move last beyond its fortnight (a lasting change is a rule: a fixed slot or a block).

## Decided by Nimish (8 Nov: "yes to all, split it")

Split out CP-21 (a draft goes live), order CP-11, CP-21, CP-12. A hand move changes only that fortnight. Only the coordinator group may accept a clash.
