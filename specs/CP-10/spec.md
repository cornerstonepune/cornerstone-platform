# CP-10: Voice on: a voice note joins the typed path, safe without the Sarvam letter

Source: https://github.com/cornerstonepune/cornerstone-platform/issues/502
Scope locked by: Nimish (the label scope-locked on the GitHub issue, 9 Nov 2026)
Waits for: CP-9 on main (the typed-form path and the nightly rebuild). Plan: docs/backend-plan.md. Roadmap task M1-01.
Tier 3 (migration, scheduled job, child data). Decision of 9 Nov 2026 (Nimish): voice is the most critical part, and the
build does not wait for Sarvam's letter.

## What

A K2 educator's voice note reaches a child's picture by the same path as a typed observation, and our side is safe
without Sarvam's letter. Recording, reading the words into draft lines, Confirm, and the observation and evidence rows
exist today but are switched off, and recording cannot be switched on without a Sarvam reference. This change:
(a) deletes the raw copies of a note (the recording and its transcript) 48 hours after it was received, by a clean-up
that runs by itself, while what the educator confirmed stays; (b) turns Sarvam's "no retention in writing" from a gate
into a recorded setting, default "not confirmed"; (c) proves a confirmed voice note and the same observation typed give
the same evidence and the same picture.

## Done when

1. 48 hours after a note was received, its recording file and its transcript are gone, whether the note was confirmed or
   left unconfirmed. Before 48 hours they are still there. Notes confirmed from now on keep no copy of the transcript's
   words in their lines. (Test with a clock: set the note's received time; no waiting.)
2. What the educator confirmed stays after the clean-up: the observation, its evidence rows, what she decided on each
   line, and the free sentence she confirmed, which the child's page still shows. (Test.)
3. The clean-up runs by itself: an n8n schedule calls one engine endpoint at least every 2 hours, with no Code node and
   no prompt. Each run is recorded as counts only. A recording that cannot be deleted fails the run and is tried again at
   the next run, including in the same hour; the transcript is never cleared before its recording is deleted; the run
   fails, and clears nothing, when the recordings folder cannot be read; a recording file with no note and older than 48
   hours is deleted too. For every note cleaned, the note's own row keeps, with no content and no name, when its
   recording was deleted and when its transcript was cleared (set once, never changed after), beside its id and
   received time, so a later check can list every note whose raw copies were deleted, when, and which of the two.
   It runs whether or not the voice switches are on. (Test; LIVE once the flow is imported on the
   box: no note with a transcript and no recording file older than 51 hours.)
4. Sarvam's "no retention in writing" is a setting, `voice.sarvam_no_retention_confirmed`, false until a person on the
   staff list records it with a written reference, signed and logged under their staff id with the reference. Turning
   recording on works with the setting false and never refuses for lack of a reference. A command prints the setting
   as "confirmed" or "not confirmed" beside the other voice switches and the last clean-up run. (Test.)
5. The data register's voice entry says what is true, in these words: "A short voice note is kept for 48 hours so the
   educator can check it, then we delete the recording and its words from our system. What the educator confirms stays
   in her class's records while your child is at the school. The speech service receives the recording only, never
   your child's name." (Exact-wording test; wording decided by Nimish, 9 Nov.)
6. A confirmed voice note and the same observation saved on the typed form give the same `activity_observation` values
   (except route and note), the same `evidence_event` rows, and, after the nightly rebuild, the same child state. A voice
   note not confirmed in 48 hours produces no observation and no evidence, even after the clean-up and the nightly
   rebuild. (Test.)
7. No recording, transcript word or name appears in git, or in any log line, response or command output from recording a
   note to its clean-up, including a failed run. (Test over captured logs, output and the tracked files.)

## Out of scope

The 20 real notes and the 5 hand calculations: they are CP-9 item 7, voice notes already count toward its 20, and they
are not repeated here. Access and role rules. Changing the Sarvam adapter, the reader of the words, or the screens.
Parent reports (CP-19). Turning recording on for the live school: Nimish's signed command after this merges. Backups
and snapshots outside the repository (a person checks their retention; see design.md risks).
