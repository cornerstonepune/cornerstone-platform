# CP-67: Curriculum as one tree (grade → subject → unit → objective), and Grade 2 → Maths shows its objectives

Issue #827. Awaiting Nimish's approval in the issue.

## What
Choosing Grade 2 and then Maths on Curriculum shows nothing. **Cause, confirmed on the live database:** the page's flow (`app/(app)/setup/curriculum/flow.tsx`) loads objectives only once a *topic* is chosen, and it takes topics only from `learning_objective.topic_code`. That column is empty for every active objective (Grade 2 Maths: 122 objectives, 0 with a topic, 24 units). So the topic row is empty and nothing below it ever loads.

The fix is the page Nimish asked for: one expand/collapse tree whose topic level is the objective's **unit**, which is filled for 2,591 of 2,593 active objectives.

- The grades (K2, G1–G4) sit as a segmented control at the top.
- Under the chosen grade, its subjects appear as collapsible rows, each with its name, an objectives count, an activities count and a chevron. Objectives with no subject sit under one "No subject yet" row (19 in Grade 2), so nothing is hidden.
- Opening a subject shows its units as collapsible rows with counts. Opening a unit lists its objectives as compact rows.
- Choosing an objective opens the existing objective panel (activities, links, edit): a side panel at 1440 px, a bottom sheet on a phone.
- The open path (grade, subject, unit, objective) is the address, so a refresh keeps it. One subject is open at a time.
- Motion is short and restrained. The appendix and "To review" stay as quiet links.

## Done when
1. As the admin, choosing Grade 2 then Maths shows Maths' units, each with its objectives count; none is empty.
2. Opening a unit lists its objectives; choosing one opens its panel with its activities, and the address holds grade, subject, unit and objective; reloading that address shows the same open path.
3. Opening a second subject closes the first.
4. Every active objective of a grade is reachable: the sum of the subject rows' objective counts equals the grade's active objectives, "No subject yet" included.
5. At 400 px the panel is a bottom sheet and the page has no horizontal scroll.
6. u90, the design-system test, passes.

## Out of scope
- Filling `topic_code`, or any schema change: the unit is already in the data.
- The appendix tables and the "To review" view, beyond linking to them.
- Today (a separate spec).

