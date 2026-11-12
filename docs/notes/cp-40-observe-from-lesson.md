# CP-40 — observe from a lesson
`/voice/form` takes optional `session_id`; `voice_confirm._of_lesson` checks it is the class's, defaults activity and day from it. Tests: `tests/test_voice_form_from_lesson.py` (one per Done-when line). Frontend: lesson page form (roll, level 0–3, rest as expected) posts `{actor, class_id, session_id, level, lists, rest}`; `activity` may be "".
