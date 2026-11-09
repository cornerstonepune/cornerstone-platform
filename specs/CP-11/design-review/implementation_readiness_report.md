# CP-11 implementation readiness (goldfish: egm-implementation-readiness and egm-codebase-details)

## egm-implementation-readiness: not ready
1. 🔴 The Proofs section lists no proofs.
2. 🔴 FN10 (15 days) is refused by the design's own 14-day rule; a second "week B Monday" cannot be held as a slot.
3. 🔴 `_place` cannot be reused: it works on in-memory loader objects and adds plan lines.
4. 🔴 The fortnight's own slots cannot be told apart from the frame: a rerun reads its own output, a second apply breaks the unique key, a later standing slot wins.
5. 🔴 Timeout and FET-failure outcomes are left to the build.
6. 🔴 FET is random: fix and store seeds, or grid proofs cannot be exact.
7. 🟡 What apply writes for unplaced or blocked cells, and slot `text`, is undefined.
8. 🟡 "Share of the fortnight total" is undefined.
9. 🟡 Concurrent apply has no lock.
10. 🟡 `--class K2-A` and `--fortnight 10` are ambiguous (no class code column; number unique per year).
11. 🟡 Spread constraint underspecified.
12. 🟡 Box proof `--dry` writes then rolls back: box proofs must be read-only.
13. 🟡 "Nothing else calls a subprocess" is false.
14. 🟢 `fet_version` source; changed-timing days gap; reader proofs.

## egm-codebase-details: four blockers
1. 🔴 `_place` (k2_timetable_load.py:230) appends to an in-memory `Load` from CSV-parsed frames; sessions are written `on conflict do nothing` and cannot be replaced.
2. 🔴 Overlay rows collide with `unique(... valid_from)` where the standing frame starts on FN10's first day (k2_timetable_sql.py:60-63).
3. 🔴 Blocked cells with no overlay row show the old subject.
4. 🔴 Reader list incomplete: `tt_rules.py` `_fixed`, `_subjects`, `_fixed_rule`, `_end` (which already ends open slots), `k2_timetable_sql.counts`, the m1-14a browser test.
5. 🟡 No class code column; reuse `--grade --section --year` (cli_timetable.py:60-64).
6. 🟡 Deleting planned sessions cascades to `materials_line` (20270102090000_materials_list.sql:61).
7. 🟡 CP-6: no cycle row means planning; reuse `fortnight_is_frozen`.
8. 🟡 `workflows.json` N4: add commands as well as files.
9. 🟡 CP-4's `access_table` is not on main: name it.
10. 🟢 CI FET line is ci.yml:143; settings follow the per-school function pattern (`internal.voice_evidence_settings`), read with `settings.config(conn, key, default)` (core/settings.py:75); full path of cli_timetable.py; week A/B computed in two places (k2_day.py:63, k2_timetable.py:194).

## How the author resolved them
See `design.md`, "Review outcome". Every blocker but the proofs list traced to putting a draft live; that step is moved out of CP-11 (decision 1 for Nimish). The rest are fixed in the design.
