# Issue 565: the notes loop (backend)

For the UI-3a screens: period, record, confirm, notes. No new table.

## What changed
- `pii.educator_note.session_id` (the lesson a note is about, optional) and `audio_key` may be empty (a note she types has no recording). Migration `20270126090000_notes_loop.sql`, with checks that raise.
- Confirming a note copies its lesson to each `activity_observation` row (that table already had `session_id`).
- Two routes in `engine/api/routes/voice.py`, logic in `engine/w3_read/voice_class.py`:
  - `POST /voice/class-notes` `{actor, class_id, day?}` → `{notes: [...], waiting_by_child: {child_id: count}}`. Each note: `note_id, status, state (being_read|fix_this|to_confirm|left_unconfirmed|confirmed), typed, session_id, received_at, taught_on, activity, children, problems, claims[{section, decision, read_as, kept_as, children}]`.
  - `POST /voice/notes/typed` `{actor, class_id, session_id?}` → `{note_id}`; the note is `drafted`, with no recording, and is confirmed with the existing confirm route.

## Columns asked for and not added (reuse beats adding)
- `note_claim.flag`: the reader's problems block Confirm, so a confirmed claim never carries one. A draft's problems are worked out when asked (`problems` on each note).
- `note_claim.child_id`: a claim covers several children. They are the note's `activity_observation` rows (the ones no correction replaced), in `claims[].children`.
- `educator_note.route`, `note_claim.entry_mode`, `note_claim.outcome`: a typed note is a note with no audio key; the outcome is `note_claim.decision`.
- The child-history peek: not built here; it needs no schema (evidence, states of kind `written`, confirmed notes) and is a separate read.

## Verified
`tests/test_voice_class_notes.py` (8), the voice, layout, table-budget, access and API tests: all passing on a fresh Postgres 16 (migrations 153 + this one). Not verified: the live database; CI's full suite; the rehearsal.
