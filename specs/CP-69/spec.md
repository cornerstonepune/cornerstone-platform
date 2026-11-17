# CP-69: My day — my lessons with their preparation, and my tasks as a board

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/834
Approved by: Nimish (his words recorded on the issue, 17 Nov 2026: "yes, go ahead and record it as the spec")

## What

The Today page becomes **My day**: one page, two parts, for any chosen day. Built on the CP-68 design language (shared components and tokens only).

**Part 1 — My lessons (top).** The lessons the educator teaches on the chosen day, in order, as a strip of cards in their subject colours. A day switcher: today, tomorrow, next week, or any date (`?day=YYYY-MM-DD`). Each lesson expands in place to its preparation: the objective(s) it teaches, the activity with its steps, the materials to get ready, and the rubric where one exists. An educator can open tomorrow tonight and know what to prepare. A coordinator or admin with no class sees the school's lessons for that day. A subject educator sees her own subject's lessons.

**Part 2 — My tasks (below), as a board.** Every kind of waiting work is a card: papers to check, notes to confirm, questions to answer, assessments to make or approve, topics to mark as taught, notes to record, clashes. Columns by urgency: **Do now · This week · When ready · Done**. A time filter (today / this week / this month) and filters for subject, class and kind. A card says what it is, which class, how many, and has one action; clicking opens the work. The board uses the full width. On a phone the columns swipe.

## Done when

1. The menu, phone tabs and page title read "My day"; the old address still opens it.
2. The day switcher moves to tomorrow, next week and a picked date, and the chosen day is in the address; both parts follow it.
3. For a day with lessons (live data starts 2026-11-23), the strip lists that educator's lessons in period order, each in its subject colour.
4. Opening a lesson shows, in place, its objective(s), its activity with steps, and its materials; a rubric only where the data has one; nothing is shown as a placeholder.
5. A subject educator sees only her subject's lessons; a coordinator with no class sees the school's lessons for the day.
6. The board shows one card per waiting item kind and class, in the column its urgency gives it; the Done column shows what was finished in the chosen period for every kind that records being finished (kinds that do not are listed in the PR).
7. The time filter (today / this week / this month) and the subject, class and kind filters change which cards show, and are in the address.
8. A card's one action opens the same screen the old Today row opened.
9. At 400 px there is no sideways page scroll; the columns swipe; the lesson strip stacks.
10. u90 (design system) passes: three sizes, no touching boxes, no one-off spacing.

## Out of scope

Writing rubrics (none exist per activity yet). Dragging a card between columns. Changes to the screens a card opens. Loading school days before 23 Nov.

---
Nimish's words (chat, 17 Nov 2026): "The 6-7 things that we want them to focus on can be converted into nice-looking Kanban cards with different status filters. Their lesson plan, or what they're supposed to teach… should also be shown with an expansion where they have all the 5-6 lectures… if I have my lectures tomorrow, I should be able to go there and see what preparation I need to make… with a toggle or a way in which I can go to tomorrow, next week… The other stuff, like questions to be checked, assessments, etc., can be for the week, with a time toggle or filter like this day, today, this week, this month… That should open up as Kanban only."
