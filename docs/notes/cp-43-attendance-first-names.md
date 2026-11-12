# CP-43 — first-name matching for attendance
`core/attendance._Index.find`: full name first, then stored-name-is-a-prefix within the grade of the report's program (`attendance.program_grades`, seed_once). Test `test_a_child_kept_by_first_name_is_matched_by_first_name_in_the_programs_grade_and_only_when_it_is_one`.
