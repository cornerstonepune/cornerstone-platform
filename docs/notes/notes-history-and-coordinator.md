# Child history, the lesson on an upload, the coordinator's notes (frontend gaps after issue 565)

No schema change. Stacked on issue 565's branch (it uses `educator_note.session_id`).

- `POST /voice/notes` (the upload) takes an optional form field `session_id`: the lesson the recording is about. It must be a lesson of that class (`voice_intake.lesson_of`, also used by the typed note).
- `POST /voice/coordinator-notes` `{actor, day?}`: every educator's notes for every class of the coordinator's campus on a day, same fields as `/voice/class-notes` plus `class_id` and `class`. Coordinators only (`k2.reads` roles, `k2_reads.require_coordinator`, which the coordinator page now shares).
- `POST /k2/child-history` `{actor, class_id, roll_no, limit?, before?}`: a child's observations, evidence and papers, newest first, each `{kind, at, who, what}`. Same access rule as the child's page (a grant on the class, or a coordinator role); the child is by Sr. No.

## Decisions
- Codes and ids only. A note's free sentence is private to its author and the coordinator, so a note shows as its id. `who` is a staff id or null: older rows keep an email or a name in their "who" text and none of it leaves.
- "State changes" are not listed: a child's state is rebuilt from the evidence (`engine graph`) and keeps no history. The evidence is what moved it.
- Evidence an observation made is shown once, as the observation; an observation a correction replaced is shown as the correction.

## Verified
`tests/test_notes_history_and_coordinator.py` (9) and 649 voice, k2, API, layout and contract tests on a fresh Postgres 16; `bin/check`. Not verified: CI's full suite; the rehearsal; live.
