# Timetable as its wireframe draws it (follow-up to #701)

Nimish, 12 Nov 2026: "still some set of lines ... not even moving blocks". The grid was there but under two tables (Live, Planning) and opened on the whole fortnight, ten tiny columns.

Done: `/timetable` is the wireframe's order: eyebrow with the week (A or B) and a state chip (Live or Planning, said in the school's words), title, purpose, one filter row (Class, Fortnight grouped Live / Planning / Earlier with each state and its dates, Day/Week/Fortnight, Previous/Next, Today, Open today), the legend, then the grid, the moved-by-hand note, two cards and lessons by subject; rail "Connected to" and "Changed this fortnight". It opens on the Week view, on the week that holds today or the first week of the fortnight on a holiday (a phone opens on the day). The Live and Planning tables are gone (`plan-sections.tsx` deleted).

Why the grid may not have drawn for a coordinator: the engine now lets coordinators read any class (`educator_gate.sees_all`, #700), so the cause that remains is a person with no *current* role grant in `k2.reads.coordinator_roles`: the engine refuses them and the page used to say it as a success box. Reproduced the good case locally (`u82`): a coordinator with no class, a class with 129 lessons over 15 periods in a fortnight still in planning, the switch off: the grid draws, one block per lesson. `GridRefused` now says what the engine checks.

Differences from the wireframe that remain (images in `docs/screens/ui-timetable-wireframe/`, wireframe left, built right):
- The filter row wraps to a second line at 1440 (the pickers are wider; Previous/Next say "Previous week" / "Next week"); the wireframe keeps one row and a full-width Open today bar.
- Every block carries a round Move button (the coordinator's, as asked); the wireframe has none.
- Time labels are the period's own label (a placeholder "17:01–17:41 U74 P1" in local data); no break bands in the local U74 class (the U82 test class draws two).
- "Moved periods" is a closed fold; the wireframe opens it with Who, Why, When, From.
- The two cards say their facts in plain lines; the wireframe has chips ("Live, frozen", "14 lines set", "5 to confirm") and "Went live by".
- Lessons by subject has no subject icon or colour, and no "Against the rule" chip while no rule exists.
- The rail has no "Today's period" link (its screen is not built), and the page adds two count lines under the legend.
- Local data has two subjects, so Arts (yellow) is not shown.
- Fortnight 10: Plan lines are a table grouped by week, the wireframe's is a card list with a count; no "Activities in the plan" rail box (fewer links asked); no Go live / Reason panel unless the fortnight is approved; the lanes list five states, the wireframe's four.
- At 400 px the grid scrolls sideways inside its own box, as the wireframe's does; the built page also shows the "Timetable pages" fold in the trail, which the wireframe does not.
