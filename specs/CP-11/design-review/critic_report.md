# CP-11 design critique (goldfish: egm-design)

Verdict: not ready to lock; 4 blockers.

1. 🔴 Refusing fortnights over 14 days refuses FN10 itself (23 Nov to 7 Dec, 15 days): its second Monday is a second "week B Monday", which the week/weekday slot model cannot hold.
2. 🔴 The `apply` overlay leaves gaps (unplaced cells fall back to the standing frame), cannot fill `timetable_slot.text`, and a second apply breaks the unique key.
3. 🔴 `k2_timetable_load._place` works on in-memory spreadsheet objects and adds plan lines; it cannot re-place sessions from database rows.
4. 🔴 The Proofs section lists no proofs.
5. 🟡 A timeout is reported as "unmeetable": add a separate outcome.
6. 🟡 Holidays "cancel", but a fortnight `fewest` limit then adds the lessons back.
7. 🟡 "The share of the fortnight total" is undefined.
8. 🟡 "Slots valid on those days" includes an earlier run's own rows; use the standing frame (`valid_to is null`).
9. 🟡 More readers of `timetable_slot`: `materials_consolidate.py:249`, `materials_list.py:323`.
10. 🟡 The staleness hash needs byte-identical input: fixed ordering plus a proof.
11. 🟡 No risks section (AGPL isolation, escaping text into XML, temporary directory, concurrent apply, solve time).
12. 🟢 Link D-074.
13. 🟢 FET behaviours "checked at build": decide them first, or make them proofs.
