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

## Builder's findings (8 Nov 2026)
- **Migration:** `supabase/migrations/20270110090000_pin_function_search_paths.sql`, 35 explicit `alter function … set search_path = public`.
  No `if exists`: a name missing at apply time makes Postgres raise, so the migration fails loudly. All 130 earlier migrations
  plus this one apply cleanly to an empty local Postgres 16; the same query the advisor uses then returns 0 unpinned (35 before).
- **Body scan:** every one of the 35 bodies was read. None is SECURITY DEFINER. No body names `pii`, `extensions`, `auth` or any
  extension function unqualified (`gen_random_uuid` is core Postgres). `internal.apply_conventions` names `internal.touch_updated_at`
  and `internal.forbid_change` already qualified, and `internal.note_received_now` names `public.note_status` qualified.
  So `public` alone is the path for all 35; no function needed `pii` or `internal` added.
- **Smoke calls:** `repinned_calls.py` against the local copy built from the migrations: 35 re-pinned, 19 ran, 6 refused NULL
  arguments, 10 trigger functions skipped, 0 failed to resolve a name. The proof still runs against the live database after deploy.
- **Guard:** `test_every_function_of_ours_pins_its_search_path` in `test_db_privileges.py`, reusing `OURS`; needs a database like its neighbours.
- **Leaked-password protection:** nothing tracked reads `auth.users` or Supabase Auth's user or admin calls (proof
  `auth_unused.py` passes). Recorded as ADR 0100.
- **Project reference:** scrubbed from the plan document (6 lines), `DECISIONS-LOG.md` (1) and `STATE.md` (1), replaced by `<project-ref>`.
- **One cost to know:** a SQL function with a `SET` clause is not inlined into the calling query by the planner. 17 of the 35
  are SQL-language (e.g. `staff_sees*`, `result_*`) and lose that. About 100 other functions already pin a path, so this
  is the existing norm; the web speed tests in CI are the check.
