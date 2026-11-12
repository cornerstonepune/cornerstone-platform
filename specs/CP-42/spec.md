# CP-42: attendance per child per day

**What.** One table `attendance` (child_id, on_date, program, status present/absent/leave, in_at, out_at, minutes). The school's attendance report (xlsx, "Consolidated Report": 13,090 rows, 142 children, 11 Jun 2026 onward, 7 programs) is turned into a gitignored CSV under `data/` and loaded by `engine load attendance <csv>`. Names are matched to `child_id` through `pii`; a name that matches no child is **listed by row number and program, never guessed and never stored**; who marked a row is not kept. Reads: `POST /attendance/child` (present %, days absent, days on leave, late arrivals, by month) and `POST /attendance/class` (by week or month). Late = in after the school's start time, a setting per program (`attendance.start_times`).

**Why a table.** It cannot be a column (one row per child per day, ~13,000 a year), nor a row in a shared table (`evidence_event` is learning evidence and append-only; attendance is neither), nor a rule or a view (it is raw fact). Raises `supabase/table-budget.json` by one, with that line.

**Done when.**
1. Loading the same CSV twice gives the same rows (idempotent); a corrected row replaces its day.
2. A row whose name matches no child is not loaded and is reported by row number and program; no name enters the table, a log or the report.
3. Status comes from the row: absent when it carries an absent time or no in-time, leave when it carries a leave time, else present; minutes from the hours text.
4. A child's read gives present %, days absent, days on leave, late arrivals by the program's start time, per month.
5. A class's read gives the same by week or month for the children enrolled in it that day.
6. Reads are for the child's class staff and coordinators; no child name in any answer.

**Out of scope.** The page; "who marked" fields; Saturday/holiday rules beyond what the file says; live load (Nimish's own word in the session that runs it).
