# CP-40: a form saved from a lesson is about that lesson

**What.** The lesson page logs observations per child. `POST /voice/form` takes an optional `session_id` (the lesson). The observation records it (`activity_observation.session_id`, which already exists), the lesson's own activity is the default, and the lesson's date is the day. No new table, no schema change.

**Done when.**
1. A form saved with a lesson and no activity writes observations on that lesson's activity, with the lesson recorded, and evidence on the activity's skills.
2. A lesson that is not this class's, or not an id, is refused (404) and nothing is written.
3. A lesson with no activity and none given is refused (409), naming that.
4. A form with no lesson saves exactly as before.

**Out of scope.** The page itself (frontend), voice-note button, structuring materials, objective gaps.
