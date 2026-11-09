# CP-10 design: voice joins the typed path, safe without the letter

Status: REVISED after goldfish review (zoom-out, design, implementation-readiness, codebase-details; findings folded in
below, marked R). Scope: `specs/CP-10/spec.md` (draft, to be locked by Nimish). **Depends on CP-9 on main** (nightly
rebuild, the n8n `f4` flow; this flow is then `f5`). "Exists" lines were read in the repository on 9 Nov.

## What exists
- The whole voice path: routes -> `voice_intake` (audio to `data/voice/<year>/<id>.<ext>` via `voice_store`; Sarvam via
  `adapters/speech.py`; transcript into `pii.educator_note.transcript`) -> `voice_note.read` (draft lines) ->
  `voice_confirm` (`activity_observation` with `route='voice'`, one `evidence_event` per skill, one `pii.note_claim` per
  line). Voice and typed already meet in `activity_observation` and `evidence_event`.
- Two switches (`voice.screens_enabled`, `voice.recording_enabled`) via `engine read voice switch`; recording refuses
  to go on without `--retention-ref` (`voice_switch.NO_REFERENCE`).
- `engine read voice expire` (48 h) and `retention` (audio only, after `voice.audio_retention_days`, null) exist; the
  M1-01 note tells the operator to add root cron lines for them, and `test_cli_voice.py` locks those lines. Not known
  whether the cron lines are installed on the box.
- **R: the child page shows the educator's free sentence from `educator_note.transcript`** (`k2_picture_reads.py`
  179-187, 267-269; `apps/web/.../k2/[class]/[roll]/page.tsx:42`). It is stored nowhere else, because `_claims` only
  keeps a value when she changed a line. Deleting the transcript as it is would remove something the school sees.
- `note_claim.words` is written at confirm and read by nothing. `note_claim` is append-only by a statement-level
  trigger that cannot allow a partial change. `educator_note` refuses any change of transcript once finished.
- `flow_run` (through `run_idempotent`, used in `api/routes/graph.py`) already stores counts in `result` and a failure in
  `error`.
- `data/` is a host folder (`deploy/compose.server.yml:31`). No backup config is in the repository; Lightsail snapshots
  are set outside it, so whether copies outlive 48 hours is not known.

## Decisions (R = changed by review; mechanical ones recorded, not asked)
1. **Raw = the audio file and `educator_note.transcript`.** Both go `voice.confirm_within_hours` (48) after
   `received_at`; one key, one cut-off, so a note can never lose its words while it can still be confirmed. `expire`,
   `confirm_note` and the clean-up use the same comparison (today `<=` and `<` disagree). `voice.audio_retention_days`
   and O-14 are retired.
2. **R: `note_claim.words` is no longer written; the column becomes nullable.** `note_claim` stays fully append-only and
   gets no new trigger. Existing rows with words: counted first; if any, the migration clears them once (a migration is
   the one place a trigger may be switched off, rule 9); if none, nothing to do.
3. **R: the confirmed free sentence is kept.** At confirm, the sentence the educator confirmed is stored as part of the
   confirmed note (the builder chooses the column; it is educator-confirmed content in `pii`, like `kept_as`), and
   `k2_picture_reads` reads it from there. This is confirmed content, not a raw copy; it stays while the child is at the
   school. Existing finished notes: the migration copies their sentence across before the clean-up first runs.
4. **Transcript clear-out without a bypass.** `note_received_now` allows `transcript` to go to null on a finished note
   and nothing else; the engine already has UPDATE, so no `security definer` function. `educator_note` gains
   two columns, `audio_deleted_at` and `transcript_cleared_at` (set once; a trigger refuses a second change), so a
   run selects notes with either unset and never re-checks old ones, and the note row itself is the durable, content-free
   record of what was deleted and when (with `id` and `received_at`), beside the `flow_run` counts. A single marker was
   not enough: it could not say which of the two was deleted.
5. **Clean-up = the engine does the thinking.** `voice_store.cleanup(conn)`: run `voice_intake.expire`; **refuse (run
   fails) if `data/voice` is not a readable folder**, so an unmounted disk never reads as "all deleted"; for each note past
   the cut-off delete its file (a missing file counts as gone only when the folder is readable); only then null the
   transcript and set the matching timestamps for that note; also delete any file under `data/voice` older than the cut-off with
   no note (a save whose commit failed). Files first, rows second (one transaction cannot span both); a failure leaves
   the note eligible for the next run. Counts only, never an id or a word. `engine read voice cleanup` replaces
   `retention`; `POST /voice/cleanup` goes through `run_idempotent` with the **hour** as its key, and a failed run is not
   stored as a replay, so a retry in the same hour runs again (the proof checks this). It runs whether or not the voice
   switches are on.
6. **Schedule = n8n `f5-voice-cleanup.json`**: hourly trigger, one HTTP node to `/voice/cleanup` with the engine key, no
   Code node (rule 3); `n8n/README.md` and `lint.py` updated. The root cron lines for `expire` and `retention` are
   superseded: `docs/notes/m1-01-voice-intake.md` and `test_cli_voice.py` change with it. Rejected: `pg_cron` (cannot
   delete files). R: the LIVE check asserts the promise, not that a job ran: no `educator_note` with a transcript, and
   no file under `data/voice`, older than the cut-off plus 3 hours. No new stale-hours config row.
7. **Sarvam as a setting, in the switch that already exists.** `voice_switch.KEYS` gains `sarvam` ->
   `voice.sarvam_no_retention_confirmed` (default false). Setting it **on** needs `--ref` (a reference, never the
   letter's words) and is signed through `core/signer` (a person not on the staff list is refused) and written to
   `access_log` with the reference, as the existing switches are; the reference lives only there. `recording` loses the
   `--retention-ref` rule: turning it on never refuses. **R: the surface** is `engine read voice status`, a new command
   printing each switch, `Sarvam no-retention: confirmed|not confirmed`, and the last clean-up run. The parent-facing
   register is static seed text and is not changed by the setting (so changing the setting never touches consents).
8. **Register wording** is a seed edit with the words Nimish decided (spec item 5). Consent versioning and existing
   consents are not part of this change (Nimish, 9 Nov); the build does not count or report them.
9. **Same path as typed.** A proof, not code: save the same observation by the form and by a voice note (a fixture
   transcript, no service call) on twin children; compare rows; run `nightly`; compare states. Add: a note left
   unconfirmed past 48 hours produces no `activity_observation` and no `evidence_event` after clean-up and the nightly
   rebuild. The builder fixes any difference found (rule 11).
10. **No raw in git, logs or output.** Capture logs, stdout and response bodies through record, draft, confirm, clean-up
    and a forced failure, and search for the fixture's distinctive words and the audio bytes; also search the tracked
    tree for audio files and the fixture's words.
11. **Edits the map and tests need (R).** `workflows.json`: the N9 `commands` list (`retention` -> `cleanup`, add
    `status`, the `sarvam` switch) and the new function's file. Tests rewritten, not deleted: `test_voice_check` (retention,
    and `voice_check.score` counts a cleaned note as cleaned, not missing), `test_voice_tables` (audio_retention_days;
    note_claim and transcript guards), `test_voice_switch`, `test_cli_voice`, `test_k2_picture_reads`.
12. **Layout.** `voice_store.py` is 75 lines; cleanup goes there unless it passes the 400-line ceiling.

## Decided by Nimish (9 Nov 2026)
- A. The free sentence the educator confirmed stays (decision 3); only the recording and the transcript are deleted.
- B. The register wording is spec item 5, verbatim.
- C. Dropped: existing consents are not counted, reported or versioned by this change.
- Records must stay checkable later: every cleaned note keeps its id, received time, when the recording was deleted
  and when the transcript was cleared (decision 4), beside the counts-only `flow_run` ledger.

## Risks, not gates
- Recordings and transcripts may live on in Lightsail snapshots or database backups beyond 48 hours. Someone with the
  Lightsail console must check retention as soon as possible; the 48 hours is only as true as the oldest copy.
- Sarvam's side stays unconfirmed until the letter; the register makes no claim about it.
- Turning recording on for the live school is Nimish's signed command after this merges.
