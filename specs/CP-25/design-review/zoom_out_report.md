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
(pending)
