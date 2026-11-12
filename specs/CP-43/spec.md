# CP-43: attendance matches a first-name-only child by first name within the grade

**What.** Live keeps every Grade 1 and Grade 2 child (and 3 of 5 in Grade 3) by first name only; the attendance report has full names, so only 19 of 142 children matched on the first load. A report name with no full-name match is matched to a child whose stored name is the start of it, only inside the grade the report's program is (`attendance.program_grades`), and only when exactly one child fits. More than one, or another program, is never picked.

**Done when.**
1. A first-name-only child matches a report name that begins with it, in the program's grade, and the load counts it (`by_first_name_in_grade`).
2. The same name under a program that is not that grade is not matched.
3. Two children with that first name in the grade: not matched, reported as two.

**Out of scope.** Spelling differences, changing stored names, any other table.
