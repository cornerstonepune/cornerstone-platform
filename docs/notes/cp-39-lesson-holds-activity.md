# CP-39: a lesson holds its activity; heads are one list (#710)

## Verified
- Local, fresh database + the repository's migrations: `pytest tests/test_rules.py test_table_budget.py test_data_register.py test_layout.py test_types.py test_tt_heads.py test_tt_edit.py`: 51 passed; with the timetable, voice, asks and api suites: all pass except 15 tests (week, bank, maker, paper routes) that fail identically on clean main on my local database (environment, unverified on CI).
- New tests (`tests/test_tt_heads.py`, 16, plus one route test): the list names every lesson head and activity group; a head's groups; set and clear an activity with one history row each; refusals write nothing (other head, no such activity, routine head, fixed lesson of no head, other grade); a Circle Time lesson holds an activity but its words stay unedited; frozen fortnight needs a reason; offers are the head's activities only, with counts; the lesson view returns its own activity first, then the plan line's, and says "no activity" with the head; the activity page returns levels and materials; a swap keeps the activity; a voice note on a lesson with no activity named becomes evidence on its skills and shows in the child's history. Mutations tried and caught: group check removed, swap dropping the activity, lesson fallback removed, plan activity preferred over the lesson's.
- No table, no function: budget stays 81 / 121. One column (`session.activity_code`) and its link; `rules.json` gains that one rule (regenerated with `engine live rules --write --url <local migrations-built database>`).
- Not measured: the effect on live (no lesson holds an activity yet).

## Handoff
- Migration `20270127100000`: one column and link, no data. Live-affecting only through the deploy; needs Nimish's own word at merge (he approved the spec in the backend session, 12 Nov).
- Deviations from the spec's text, recorded in the issue: an activity's head is worked out, not stored; a fixed lesson may hold an activity when its head takes one.
- Still to do (guarded data steps, after this migration is live): the one K2 activity with a blank group to English; the 6 lessons of fortnight 10 whose plan line has an activity take it onto the lesson.
- Routes: `POST /timetable/lesson/offers {actor, session_id}`; `POST /timetable/lesson/edit` gains `activity_code` (empty clears). The educator's period view returns `activity.chosen`, `head` and `activity_detail`.
- Frontend: wire the block's choose-an-activity and the click-through to the activity (objectives, skills, materials, rubric levels).
