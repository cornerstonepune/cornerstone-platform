-- CP-10: a voice note's raw copies (its recording and its transcript) go 48 hours after it was received; what the
-- educator confirmed stays. Specs: specs/CP-10/spec.md, design.md.
--
--   * educator_note.sentence             the free sentence she confirmed, kept at confirm (the child's page reads it from here,
--                                        so it outlives the transcript it was read from)
--   * educator_note.audio_deleted_at     when the recording was deleted, and
--   * educator_note.transcript_cleared_at when the transcript was cleared: set once, never changed (a content-free record
--                                        of what was deleted and when, beside the note's id and received time)
--   * note_claim.words                   no longer written: nothing read it, and it was a copy of the transcript
--   * a finished note's transcript may now go to null (and only to null)
--   * voice.audio_retention_days (O-14)  retired: one key, voice.confirm_within_hours, is both how long a note waits to be
--                                        confirmed and how long its raw copies are kept

alter table pii.educator_note
  add column if not exists sentence text,
  add column if not exists audio_deleted_at timestamptz,
  add column if not exists transcript_cleared_at timestamptz;

alter table pii.note_claim alter column words drop not null;
-- existing lines: the migration is the one place an append-only table may be rewritten (rule 9)
alter table pii.note_claim disable trigger note_claim_append_only;
update pii.note_claim set words = null where words is not null;
alter table pii.note_claim enable trigger note_claim_append_only;

create or replace function internal.note_received_now() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.received_at := now();  -- the server's clock, set on insert, never the phone's
  else
    new.received_at := old.received_at;  -- when it reached us never moves
    new.staff_id := old.staff_id;
    new.audio_key := old.audio_key;
    -- when the raw copies were deleted is set once
    new.audio_deleted_at := coalesce(old.audio_deleted_at, new.audio_deleted_at);
    new.transcript_cleared_at := coalesce(old.transcript_cleared_at, new.transcript_cleared_at);
  end if;
  if tg_op = 'UPDATE' then
    -- a confirmed note is what its claims were read from: its words and class never change after, except that its
    -- transcript is cleared (set to null) when the raw copies go; a confirmed or left-unconfirmed note stays so; no
    -- note moves back to an earlier status
    if old.status in ('confirmed', 'left_unconfirmed') and (new.status is distinct from old.status
        or (new.transcript is distinct from old.transcript and new.transcript is not null)
        or new.class_id is distinct from old.class_id) then
      raise exception 'a % note is kept as it was', old.status using errcode = 'check_violation';
    end if;
    if (select ord from public.note_status where tenant_id = new.tenant_id and code = new.status)
       < (select ord from public.note_status where tenant_id = old.tenant_id and code = old.status) then
      raise exception 'a note does not go back from % to %', old.status, new.status using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.status_at := now();
  end if;
  return new;
end $$;

-- A school added later gets the same words and the one hours setting, and no retired retention row.
create or replace function internal.voice_vocabulary(p_tenant uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into observation_outcome (tenant_id, code, ord, words)
  select p_tenant, v.code, v.ord, v.words
  from (values ('above', 0, 'above'), ('as_expected', 1, 'as expected'), ('below', 2, 'below'),
               ('not_willing', 3, 'not willing'), ('absent', 4, 'absent')) v (code, ord, words)
  on conflict (tenant_id, code) do nothing;
  insert into observation_entry_mode (tenant_id, code, ord, words)
  select p_tenant, v.code, v.ord, v.words
  from (values ('individual', 0, 'named'), ('group_as_expected', 1, 'the rest did as expected')) v (code, ord, words)
  on conflict (tenant_id, code) do nothing;
  insert into observation_route (tenant_id, code, ord, words)
  select p_tenant, v.code, v.ord, v.words
  from (values ('voice', 0, 'voice note'), ('form', 1, 'form')) v (code, ord, words)
  on conflict (tenant_id, code) do nothing;
  insert into note_status (tenant_id, code, ord, words)
  select p_tenant, v.code, v.ord, v.words
  from (values ('received', 0, 'reading your note'), ('drafted', 1, 'to confirm'), ('confirmed', 2, 'confirmed'),
               ('left_unconfirmed', 3, 'unconfirmed')) v (code, ord, words)
  on conflict (tenant_id, code) do nothing;
  insert into claim_decision (tenant_id, code, ord, words)
  select p_tenant, v.code, v.ord, v.words
  from (values ('accepted', 0, 'kept as read'), ('changed', 1, 'changed'), ('removed', 2, 'removed')) v (code, ord, words)
  on conflict (tenant_id, code) do nothing;
  -- How long a note waits for her, and so how long its recording and transcript are kept (CP-10).
  insert into config (tenant_id, key, value, description)
  values (p_tenant, 'voice.confirm_within_hours', '48'::jsonb,
          'A K2 voice note not confirmed within this many hours leaves the educator''s queue, is kept as unconfirmed, and never becomes evidence (observation model, section 4). The same hours are how long a note''s recording and transcript are kept: the clean-up deletes both then (CP-10).')
  on conflict (tenant_id, key) do nothing;
end $$;

delete from config where key = 'voice.audio_retention_days';
