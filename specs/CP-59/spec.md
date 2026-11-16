# CP-59: Delayed lessons: move a set of not-taught lessons to a coming week, and see what moved

Issue: https://github.com/cornerstonepune/cornerstone-platform/issues/792

## What
Nimish, 16 Nov: "Teachers must be able to move a set of lessons to a coming week, understanding what moved, what changed and what wasn't taught; an interface to selectively place delayed things in a different week."

Page `/timetable/delayed` (a "Delayed lessons" button on the timetable, coordinator): the class's not-taught lessons of a week with tick boxes, a coming week's free places (pre-filled per lesson, changeable), one Move for all ticked, and the week's ledger. Engine: `POST /timetable/delayed` (`w2_print/tt_delayed.py`): free places only, never a swap, one refusal moves none.

## Done when
1. The engine moves several not-taught past lessons into free places of a later week in one save, each a `move` history row; a refusal writes nothing.
2. The page lists the not-taught lessons of the week with a tick box each, and the free places of the target week.
3. Ticking three lessons and choosing a week moves all three in one save, each shown as moved in the ledger.
4. Saving with nothing ticked is refused with a plain message and moves nothing.
5. The week's ledger shows what moved, what changed and what was not taught, with who and when.
6. An educator uses it for her own class (the timetable switched on for her), never for another class's: the engine refuses it, 403.

## Out of scope
Swapping into a planned lesson; moving a taught lesson; any migration; who may move beyond the educator's own class and the coordinator's any class.

## Proofs
`apps/web/tests/u102-delayed-lessons.spec.ts` (2-6), `packages/engine/tests/test_tt_delayed.py` (1).
