# Stage 5: Initial Zoom Out

## egm-inventive-catalyst
No blocker. Main results 1 and 2.
1. 🟡 "Layer when there is one, else frame" stays a rule each reader writes (the clash view, the new fortnight_slots,
   and the day page `k2_day.py`): the very cause of item 1. Fix: one `public.fortnight_cells(class, fortnight)` on top of
   `fortnight_days` (language sql stable, inlinable) that every reader selects from.
2. 🟡 Group membership written twice (Python `in_group`, SQL `fortnight_is_approver`) with two clocks. Fix: one SQL
   `internal.in_groups(tenant, staff, key)`; `fortnight_is_approver` and the Python helper both call it.
3. 🟡 Checks at six doors is the "many writers, easy to miss one" shape the design rejects for item 4. Fix:
   `who_may.as_actor(conn, email, action)` is the only way a door gets a staff id; one dict maps action to setting; one
   test walks the dict.
4. 🟡 The clash rule for `approved` is a rule of the fortnight's state: put it in `fortnight_cycle.move` (if no CP-6
   locked proof steps to approved with an open clash).
5. 🟡 Thresholds are settings too and are still overwritten: apply the same seed_value rule, or say they are the
   developers'.
6. 🟢 Say what drafting does on a date with no calendar row in a fortnight with no layer.
7. 🟢 `who_may` belongs in `core/` (it reads CP-3 tables and config), not `w2_print/`.
8. 🟢 Say which shape (string or list) the new group keys are seeded with.

## egm-zoom-out
Verdict: not ready to lock. Item 1's root cause confirmed correct; the key swap and signature order are needed.
1. 🔴 Item 7: option A drops "parent reports" from a fixed Done-when line. Either the issue's line 7 is amended first
   (Nimish) or the design plans B.
2. 🟡 A fifth copy of the A/B rule: `w2_print/k2_day.py` line 65 (the day page). Add it to the table and remove it.
3. 🟡 Item 3's table misses `engine timetable load --apply` (writes the frame, no `--by`, no check) and wrongly lists a
   command for rule changes (route only). Say whether `engine plan link` changes the timetable.
4. 🟡 Non-Goals says go-live and clash-accept checks do not change, but the shared helper adds "active staff".
5. 🟢 Approve-class checked twice (Python and SQL): call `fortnight_approve` and map its refusal instead.
6. 🟢 The clean-up limit should be a `watch.*` threshold row like the watch's other limits (no migration lines).
7. 🟢 Say why item 4 covers config only (only config has a writer outside the loader).
8. 🟢 Item 6: delete the raw steps rather than add counting code; the proof must also cover `.github/measure/*.py`.
9. 🟢 `who_may` takes a staff id the door already resolved; item 7 needs only `assess/render.render_sheet` (packs merge
   its PDFs); give a reason for granting `fortnight_days` to `app_web`.
