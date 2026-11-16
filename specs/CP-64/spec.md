# CP-64: The curriculum screens: the objectives table, one objective's whole chain, and what to check this week

Issue: https://github.com/cornerstonepune/cornerstone-platform/issues/800

## What
CP-54's Done when 11 and 12, read from the CP-54 tables. Web only.
- Objectives (`/setup/curriculum/objectives`): Grade, Subject, Topic, Objective, Capability, Words, Activities, Origin; filters; ten rows a page.
- One objective (`/setup/objectives/<code>`): its whole chain up and down.
- Check this week (`/setup/curriculum/check`): the machine-made rows by grade and subject; one action per group confirms the batch.

## Done when
1. The table shows, for every objective, grade, subject, topic, capability, words, activity count and origin; the machine's carry the mark.
2. The grade, subject, topic and origin filters narrow it, in the address; ten rows a page with the total beside them.
3. An objective's page shows its chain upward (topic, subject, grade, capability, words, framework statements) and downward (activities, skills, evidence counts).
4. Check this week lists the machine-made rows by grade and subject, counted from the tables; a group with none is not shown.
5. Confirming a batch writes one approval row and changes the batch's rows from machine to person; only a coordinator; a second confirm changes nothing. WAITS: needs the `curriculum_link` approval kind (one migration) and an engine route `/curriculum/confirm`; asked of the orchestrator.

## Out of scope
Editing an objective's words; the data itself (CP-54).

## Proofs
`apps/web/tests/u104-curriculum-screens.spec.ts`, one test per line 1-4.
