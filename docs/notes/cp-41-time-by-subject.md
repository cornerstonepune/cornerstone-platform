# CP-41 — time by subject
`w2_print/tt_time.py` + `POST /timetable/time`. Target = the standing frame for the days that have lessons (live has 0 `limit` rules, so a limit-based target would be empty). Period with no end lasts to the next start. Tests `tests/test_tt_time.py`. Setting `timetable.time_tolerance_pct`.
