-- CP-5: pin the search path of the 35 functions the Supabase advisor flags (function_search_path_mutable).
-- A function with no fixed search path resolves its table and function names through whatever path the caller set,
-- so a caller who puts their own schema first can make it read the wrong table. None of these is SECURITY DEFINER,
-- none reads pii.*, and none calls an unqualified name outside public (bodies read 8 Nov 2026), so `public` is
-- the whole path, as in the other ~100 functions that already pin one.
-- The list is explicit and not discovered at run time: a name missing here makes `alter function` raise, so the
-- migration fails loudly instead of skipping.

alter function public.checks_to_trust(boolean[],integer,double precision) set search_path = public;
alter function public.confirm_skill_link(uuid,uuid) set search_path = public;
alter function public.current_item_key(text) set search_path = public;
alter function internal.apply_conventions() set search_path = public;
alter function internal.claim_decided_now() set search_path = public;
alter function internal.evidence_vocabulary(uuid) set search_path = public;
alter function internal.forbid_change() set search_path = public;
alter function internal.forbid_delete() set search_path = public;
alter function internal.item_own_registry_skill(jsonb,text[]) set search_path = public;
alter function internal.level_samples(text) set search_path = public;
alter function internal.note_received_now() set search_path = public;
alter function internal.observation_stored_now() set search_path = public;
alter function internal.refuse_grant_edit() set search_path = public;
alter function internal.retire_flagged_item() set search_path = public;
alter function internal.school_states(uuid) set search_path = public;
alter function internal.school_vocabulary(uuid) set search_path = public;
alter function internal.skill_link_vocabulary(uuid) set search_path = public;
alter function internal.staff_have_ids() set search_path = public;
alter function internal.staff_note_words_stay() set search_path = public;
alter function internal.touch_updated_at() set search_path = public;
alter function public.mistake_name(text,text,text) set search_path = public;
alter function public.operation_sign(text) set search_path = public;
alter function public.propose_skill_link(uuid,text,text,text,text,text) set search_path = public;
alter function public.result_order(jsonb,text) set search_path = public;
alter function public.result_part(jsonb,text) set search_path = public;
alter function public.result_response(jsonb,text) set search_path = public;
alter function public.result_slot(text,jsonb) set search_path = public;
alter function public.roll_order(text) set search_path = public;
alter function public.sheet_subject(uuid) set search_path = public;
alter function public.skill_taught_in(uuid,text,text) set search_path = public;
alter function public.staff_id(text) set search_path = public;
alter function public.staff_sees(text,text[],text[],uuid,text,text,uuid) set search_path = public;
alter function public.staff_sees_capture(text,text[],text[],uuid,uuid) set search_path = public;
alter function public.staff_sees_sheet(text,text[],text[],uuid,uuid) set search_path = public;
alter function public.taught_in(uuid,text,text) set search_path = public;
