-- Issue #565: the educator's notes screens (period, record, confirm, notes). Two changes to one table, no new table:
--   * pii.educator_note.session_id   the lesson (a `session`) the note is about. Class, educator and day cannot tell
--                                    two lessons of one day apart. Optional: a note may be about the day, not a lesson.
--   * pii.educator_note.audio_key    may be empty: a note she types ("Type the marks") has no recording. A typed note IS
--                                    a note with no audio key; no `route` column is kept (it would repeat that fact).
-- What is NOT added (each is worked out when asked, from rows that exist): a reader's problem on a claim line
-- (problems block Confirm, so they live only on a draft: `voice_intake.resolve`), the children a claim covers (the
-- note's `activity_observation` rows, one per child), a claim's outcome (`note_claim.decision`).

alter table pii.educator_note
  add column if not exists session_id uuid references public.session(id),
  alter column audio_key drop not null;

create index if not exists educator_note_session_idx on pii.educator_note (session_id) where session_id is not null;

do $$
begin
  if not exists (select from information_schema.columns where table_schema = 'pii' and table_name = 'educator_note'
                 and column_name = 'session_id') then
    raise exception 'issue 565: pii.educator_note.session_id was not added';
  end if;
  if (select is_nullable from information_schema.columns where table_schema = 'pii' and table_name = 'educator_note'
      and column_name = 'audio_key') <> 'YES' then
    raise exception 'issue 565: pii.educator_note.audio_key still refuses an empty value';
  end if;
  if exists (select from pii.educator_note where audio_key is null) then
    raise exception 'issue 565: a note already had no audio key before any typed note was made';
  end if;
end $$;
