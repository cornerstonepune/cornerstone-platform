# CP-14: Skill links a person confirmed, and "ready next" per activity

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/482

DRAFT for Nimish. Not locked. Waits for CP-13 (merged). Plan: docs/backend-plan.md. Roadmap tasks M1-15, M1-17.
Tier 3 (database change; changes what a child's page says). Design: specs/CP-14/design.md.

## What

"Ready next" tells an educator which skill, and now which activity, a child can move on to. It only uses links between
skills ("A comes before B") that a member of staff has confirmed. Today none is confirmed, so it says nothing. This scope
lets a person confirm a whole reviewed list in one step, say no to a link (or take back a confirmation) with a reason,
keeps a record of every such decision, and adds "ready next" per activity. Then the K2 educator's real list is loaded and
decided on live.

## Done when

1. A person confirms a reviewed list in one step, by skill pairs. Every link in the file is then confirmed and names that
   person; if any pair in the file is wrong, nothing is confirmed and the line is named. (Test.)
2. A person can withdraw a link, proposed or confirmed, with a reason. It stops counting for "ready next" at once; a blank
   reason is refused. (Test.)
3. Every confirmation and withdrawal is kept in the edit history with who and when; a later decision never erases an
   earlier one. (Test.)
4. Only a coordinator or an educator can confirm or withdraw a link, and the person who loaded a list cannot confirm its
   links. Which roles count is a settings row, not code. (Test.)
5. The child page lists the activities of the child's grade that are ready next, each with the ready skills that make it
   so. An activity is listed when at least one of its skills is ready and none of its skills still waits on a confirmed
   "must come before" skill. A skill with no confirmed link is never claimed either way. (Test, worked by hand.)
6. "Ready next" per skill gives the same answers as before, and the page's number of database reads stays fixed whatever
   the class size. (Test.)
7. LIVE: the K2 educator's list is loaded; the number of links between K2 activity skills is above zero and none is left
   undecided. (Read-only count on the box, counts only.)

## Out of scope

Any screen. Marking which fortnight a ready activity is already planned in (waits for CP-8's plan links). A machine
proposing links (CP-16). Links between maths micro-steps. A "not ready" list. The child-level rule (CP-13).

## Depends on

CP-4: no new table, so no new access row; once CP-4 lands, one test that an educator of the class still gets
`ready_activities`. People's step for item 7: the K2 educator writes the "A before B" list.
