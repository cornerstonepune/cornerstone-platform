# CP-5 branch note: database hygiene

## The 35 functions (live advisor `function_search_path_mutable`, read-only, 8 Nov 2026 09:16 UTC)
Read from the live project through the Supabase connector. All 35 are SECURITY INVOKER (none definer), none read `pii`.
Full signatures (from `pg_proc`, schema-qualified where not `public`):

public: checks_to_trust(boolean[],integer,double precision); confirm_skill_link(uuid,uuid); current_item_key(text);
mistake_name(text,text,text); operation_sign(text); propose_skill_link(uuid,text,text,text,text,text);
result_order(jsonb,text); result_part(jsonb,text); result_response(jsonb,text); result_slot(text,jsonb); roll_order(text);
sheet_subject(uuid); skill_taught_in(uuid,text,text); staff_id(text); staff_sees_capture(text,text[],text[],uuid,uuid);
staff_sees_sheet(text,text[],text[],uuid,uuid); staff_sees(text,text[],text[],uuid,text,text,uuid); taught_in(uuid,text,text)

internal: apply_conventions(); claim_decided_now(); evidence_vocabulary(uuid); forbid_change(); forbid_delete();
item_own_registry_skill(jsonb,text[]); level_samples(text); note_received_now(); observation_stored_now();
refuse_grant_edit(); retire_flagged_item(); school_states(uuid); school_vocabulary(uuid); skill_link_vocabulary(uuid);
staff_have_ids(); staff_note_words_stay(); touch_updated_at()

## For the builder
- Path convention is `set search_path = public` (about 40 existing migrations). Read each body before pinning: add another
  schema only where a body calls it unqualified. A body scan for unqualified extension names is still required.
- Leaked-password protection: the other advisor finding. Decision (Nimish, 8 Nov): recorded as not applicable.
- Project reference scrub includes STATE.md (Nimish allowed the one-line scrub).
