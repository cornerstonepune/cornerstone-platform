# UI-11b: Questions to answer, carried onto Curriculum

(issue #599; the orchestrator's ruling: `/asks` becomes a card plus a table on Curriculum.)

- **Curriculum** now has a "Questions to answer" card (how many wait, how many for you; "Read them" jumps to the table) and a table of
  the waiting questions, yours first, ten a page (`apage`). Each row: the question, who it is for, what was drafted, why, "Read it in
  full" (opens the draft in a new tab), "Agree as drafted, as <name>", and a box to write what it should say with "Correct it, as <name>".
  The answered ones are folded below with who answered, when, and what they said.
- `answerAsk` takes a `back` (`/asks` or `/setup/curriculum…`), so the old page still works until it is retired.
- Inventory: elements added to `curriculum` in screens.json (card link, Read it in full, Agree, field, Correct, answered fold, pager). A link that opens a new tab
  is `newTab: true` (the inventory checks that a tab opens; CI does not reach the other site). `external` keeps its old meaning.
- Test: `u74-setup-content.spec.ts` "a question drafted for a person is agreed or corrected…" holds the assertions of the `/asks` test
  in `u13-needs-you.spec.ts`; that one moves when `/asks` is retired (step C).
- Wireframe: `curriculum.html` needs these elements drawn once #642 (the wireframe redraw) is on main.
