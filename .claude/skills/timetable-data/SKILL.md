---
name: timetable-data
description: Use when changing timetable data, fortnights or sessions.
category: database
---

# Timetable data: rules that bite

Change a lesson's contents in place with an `update`; never delete and re-insert a `session` row. `materials_line_session.session_id` is `on delete cascade`, so a delete silently drops the materials lines linked to that lesson.

Week A/B comes from the calendar date (`k2_day.py`), not from a stored week. A fortnight can run 15 days, so one place (period, week, weekday) can have two dates in the same fortnight. Any move, copy or count must cover every date that place has there; never assume one date per place.

Before writing a scope or proof about the timetable, check which tables actually record the thing (a teacher, a room, a lead adult). A rule with no recorded data cannot be proved on live.
