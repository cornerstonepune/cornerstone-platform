# CP-11: Timetable generator

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/459
DRAFT for Nimish. Not locked. Waits for CP-6 in the plan (with this design it reads and writes nothing CP-6 adds; putting a draft live, which would need CP-6, is decision 1 below). Plan: docs/backend-plan.md. Roadmap task M1-14. Tier 3 (a migration and the engine image). Design: specs/CP-11/design.md.

## What

One command makes a draft timetable for one class and one fortnight (weeks A and B) from the rules the school entered, using the FET program, and keeps it with FET's exact input and output. If the rules cannot be met, it says how many lessons it placed against how many were needed and which rule stops it, and writes nothing to the timetable. FET was installed by pull request #413 (merged 8 Nov 2026 without a scope or proofs); this scope proves it works, on the box too. Nothing educators see changes: putting a draft live is a separate step.

## Done when

1. FET is in the deployed engine image: the image build fails without it, CI prints its version, and on the box the running engine prints its version. (Test + CI; box only: version read inside the engine container.)
2. One command, `bin/engine timetable generate` with the class and the fortnight, makes a draft that places every needed lesson: each on a free period, each subject within its fewest and most, a subject at most once a day where its count allows, pinned periods untouched, blocked days and periods empty. The draft keeps FET's exact input file and output file. (Test, on the FET version CI installs.)
3. When the rules cannot be met, the command reports lessons placed against lessons needed and names the blocking rule (the limit or block, in its own words) when the system can find it; if FET runs out of time it says "no timetable found in time", never "impossible". In every case nothing is written to the timetable, the sessions or the plan lines. (Test, one per case.)
4. Running the command twice on the same rules gives the same input file and the same draft. (Test.)
5. A fortnight longer than two weeks (Fortnight 10 is 15 days) is drafted day by day with no day lost; a school holiday has no lessons; a kept draft cannot be changed or deleted. (Test.)
6. LIVE: on the box, a dry run for the K2 class's current or next teaching fortnight places every needed lesson and writes nothing (row counts equal before and after). (Box only, read-only.)

## Out of scope

Putting a draft live in place of the current timetable (decision 1: CP-12 or its own scope). Hand moves and clashes (CP-12). Several classes at once, teachers and rooms. "Keep lessons where they are". Re-doing the FET install (#413). Any screen.

## Decisions for Nimish

1. Putting a generated timetable live is a separate step, not in CP-11. Recommended: add it to CP-12, which already changes the live timetable under the fortnight freeze.
2. Lessons on a school holiday are dropped, not moved; lessons on a blocked day are moved. Recommended: yes.
