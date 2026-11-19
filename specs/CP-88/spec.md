# CP-88: Marking the class: tap the children, then give them a level

Nimish, 19 Nov 2026 (screenshot of `/period/<id>`, "Mark the class"): "I'm not able to click on five children and mark them as something. This
navigation is not proper." Today a tap on a child's card opens a one-child level picker; choosing several is a separate row of 22 checkboxes
under the grid, far from the cards, and its level buttons appear above the grid. Two ways to select, neither on the cards.

## What

One way: **tap the children, then choose the level.** A tap on a child's card selects it (the card shows a tick and an accent outline); tap again
to unselect; any number. Once anyone is selected one bar appears beside the grid ("5 selected") with the levels and the other marks as buttons and
a Clear; choosing a level marks every selected child at once and clears the selection. For one child it is the same: tap, then the level.
"Select all unmarked" stays as a button above the grid; "Level for the rest" stays as it is. The checkbox row is gone.

## Done when

1. Tapping a child's card toggles its selection (tick and outline on the card, `aria-pressed`); several can be selected; the keyboard does the same
   (Enter or Space).
2. With anyone selected, one bar beside the grid says how many, offers every level and the other marks, and a Clear; on a phone it stays in view
   without scrolling to the bottom of a long class.
3. Choosing a level marks all the selected children with it in one save and clears the selection; the saving, the as-expected defaults and the
   history are unchanged.
4. The separate "Tick several children" checkbox row and the one-child picker are gone; marking one child is tap then level.
5. At 1440 px and 400 px (no sideways scroll, controls of at least 44 px); the design-system guard still passes.

## Out of scope

The activity, objective and skill pages; any change to what a mark means or how it is stored.
