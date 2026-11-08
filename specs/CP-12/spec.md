# CP-12: The timetable by hand

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/484 (DRAFT for Nimish. Not locked.)

Waits for CP-11 (the generator), and through it CP-6 (the fortnight cycle) and CP-4 (the access table list). Plan:
docs/backend-plan.md. Roadmap task M1-14. Tier 3 (data change). Design: specs/CP-12/design.md.

## What

After the generator places a fortnight's lessons, a person can move a lesson by hand or swap two. Every move is kept with who made it, when, from where, to where and why. The system lists every clash in a fortnight (the same adult in two places at once, a lesson on a blocked day or period, a subject above its most or below its fewest) and a person can accept a clash with a reason. The fortnight (weeks A and B) is the unit: a move, the clash list and every count are per fortnight.

## Done when

1. A lesson can be moved to another day, period or week of the same fortnight, or swapped with another lesson. Each move is kept with who, when, from, to and the reason given; the history cannot be changed or deleted. (Test.)
2. A move changes only the fortnight it was made in; the same lesson in the fortnights before and after stays where it was. (Test.)
3. After a move, the educator's day shows the lesson in its new place with its plan line. A fixed lesson, a move to or from a day already past or a holiday, or a lesson already marked done or not done cannot be moved, and the refusal says why and writes nothing. (Test.)
4. Each fortnight's clashes are listed with their kind, fortnight number, week and the lessons involved, for each kind: the same adult in two lessons at overlapping times (also across grades), a lesson on a blocked day or period, a subject above its most or below its fewest in a week or the fortnight. Moving a lesson back removes its clash from the list. (Test, one per kind.)
5. A person can accept a clash with a reason; who and when are kept. An acceptance covers only that clash: if a lesson in it moves again, its adult changes, or its limit changes, the clash is listed as not accepted. (Test.)
6. A fortnight with a clash nobody accepted cannot be approved, and in an approved fortnight a move that would leave a clash nobody accepted is refused. This is a setting per school, on by default. (Test.)
7. Regenerating a fortnight that has hand moves is refused, with the number of moves, unless the person says to discard them; a discard is recorded with who. (Test.)
8. In a frozen fortnight, a move without a reason is refused and a move with a reason is kept. (Test.)
9. LIVE: the move history and clash acceptance exist with role rules on; the clash count per fortnight is printed (read-only, counts only, no names). The existing website pages and engine tests pass unchanged.

## Out of scope

Any screen (the month and quarter calendar, drag to move). The generator itself (CP-11). Rooms (no room records exist). One-day changes such as a substitute or a cancelled lesson. Making a move last beyond its fortnight (a lasting change is a rule: a fixed slot or a block).
