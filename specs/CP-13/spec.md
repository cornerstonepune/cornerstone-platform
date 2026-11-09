# CP-13: Child level rule, second change

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/461
Scope locked by: Nimish (the label scope-locked on the GitHub issue, 8 Nov 2026)

DRAFT for Nimish. Not locked. Waits for CP-4. Plan: docs/backend-plan.md. Roadmap task M0-07. Tier 3 (changes how a child's level is computed).

## What

Three fixes to how the child's picture is computed. A repeating mistake that stops appearing must clear. One adult noting something twice counts once. The minimum number of adults needed is a setting per grade, not a number in code.

## Done when

1. A mistake absent from a child's recent answers stops marking that child as "repeating". (Test.)
2. Two notes by the same adult count as one adult. (Test.)
3. The minimum adults is a row per grade: 2 by default, 1 for K2. Changing the row changes the result with no code change. (Tests.)
4. Every child state that would change on a copy of live data is listed, and Nimish says yes before it is applied. (Evidence: the list, counts only; applying is a separate step he approves.)
5. The three signals stay distinct: blank, wrong, wrong-with-working. (Test.)
6. The graph is rebuilt from confirmed evidence only and gives the same result when rebuilt twice. (Test.)

## Out of scope

Skill links (CP-14). Any screen.
