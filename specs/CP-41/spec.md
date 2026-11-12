# CP-41: where a class's teaching time goes

**What.** `POST /timetable/time {actor, start, end, class_id | grade}` sums lesson minutes by subject over a date range and sets each beside the standing timetable (the frame rules) for the same days, with the share of teaching time and within / over / short. Reads only; no new table. `timetable.time_tolerance_pct` (seed, 10) is the school's margin. A whole grade is for coordinators.

**Done when.**
1. Each subject has lessons, minutes, share and standing minutes; shares make a whole; a lesson matching the frame is `within`.
2. A holiday, and days with no lessons for the class, count on neither side.
3. Dropped lessons make a subject `short`; a lesson turned into it makes it `over`.
4. The tolerance is the school's setting.
5. The route answers a coordinator for a class or a grade; refuses both-or-neither, a backwards range (422) and a teacher asking for a grade (403).

**Out of scope.** The page; per-week limits (no `limit` rule exists on live today).
