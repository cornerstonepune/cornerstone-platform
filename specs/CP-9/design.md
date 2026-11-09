# CP-9 design: observations become evidence for real

Status: REVISED after goldfish review (zoom-out, design, implementation-readiness, codebase-details; summary in `specs/CP-9/design-review/summary.md`). Scope: `specs/CP-9/spec.md` (locked by
Nimish, 8 Nov 2026). **Depends on CP-4** (which depends on CP-3, which depends on CP-2). CP-2/3/4 are built one at a
time, so these proofs are written against the schema on `main` plus the two things CP-4 adds and this scope uses:
`access_table` (every new table must be listed in it, or `apply_conventions()` raises) and `engine_all` rules on every
table (the nightly job runs as the engine login). Nothing else from CP-3/CP-4 is assumed.

## What exists (verified in the repository, 8 Nov)
- The typed form and the voice path already write the rows: `voice_confirm.save_form` / `confirm_note` write
  `activity_observation` (append-only by trigger `forbid_change`; a correction is a row with `supersedes` and `reason`,
  corrected once) and one `evidence_event` per skill the activity names (`kind='observed'`, `observation_id` set, trigger
  `evidence_of_a_confirmed_note` refuses evidence from an unconfirmed voice note).
- The picture is `child_observed_state`, a pure function of A: `graph_observed_states()` reads only
  `evidence_event.confirmed_by is not null`, skips observations that something supersedes, and
  `rebuild_child_observed_state(child)` rewrites a child's rows. `engine.assess.graph.rebuild(conn)` runs it, plus the
  written-answer picture (`child_skill_state`), for every child with confirmed evidence. `engine graph` calls it.
- **Nothing calls it on a schedule** (the route `POST /graph/rebuild` and `engine graph` exist and are run by hand). No ledger of runs exists. The only nightly jobs are GitHub's proof re-run and
  `watch-live`. So item 1 is a real gap.
- A correction route exists (`POST /voice/observations/correct` -> `voice_confirm.correct`). Whether it satisfies item 2
  end to end is for the proof to say; the builder fixes what the proof finds (rule 11).
- "Unplanned" is a hard `None` in `w3_read/k2_reads._counts` with the text `UNPLANNED_WHY`, because `session` and
  `plan_entry` did not exist then. They exist now (migration `20261231090000`): `session.planned`, `session.plan_entry_id`,
  `session.state`, `session.school_day_id -> school_day.on_date`.
- Three signals live in `item_result.status` (right / wrong / blank) and `item_result.working_shown`
  (none / partial / full), carried to `evidence_event.mark` (right / wrong / blank) and to the evidence through
  `item_result_id`. Observed evidence uses its own scale (yes / sometimes / not_yet).

## Decisions (recommended; mechanical ones recorded, not asked) (R = changed by review)
1. **Scheduler: an n8n flow** `n8n/workflows/f4-nightly-graph.json` (R: f4, the next free name; `n8n/README.md` and `n8n/lint.py`
   updated): schedule trigger 02:30 `Asia/Kolkata`, one HTTP node `POST /graph/nightly` to the engine with the engine key
   and an `Idempotency-Key` of the date (R: the existing `POST /graph/rebuild` in `api/routes/graph.py` derives its key from
   the body, so an empty body would replay every night). No Code node (rule 3). Rejected: a GitHub cron (late under load,
   cannot reach the database), `pg_cron` (a second place for logic). A flow that never fires leaves no row, so the
   ledger is also checked for staleness (item 1, LIVE; the window is config row `graph.nightly_stale_hours`, default 26) (R).
2. **Ledger `graph_run`**, append-only (`forbid_change`; the existing revoke migration already limits engine/web to
   insert/select, so no extra grant): `id`, `started_at`, `ran_at` (both from the run's clock), `ok`, `error` (exception
   class and a truncated message; never a name), `children`, `evidence_rows`, `evidence_digest_before` / `_after`,
   `skill_states_before` / `_after`, `observed_states_before` / `_after`, `states_digest_before` / `_after`. (R) Digests
   cover only evidence rows with `created_at < started_at` (a watermark, so evidence confirmed during the run cannot make
   before differ from after) and are `md5(string_agg(to_jsonb(row)::text, '' order by id))` over the rows' business columns
   (every column but the surrogate id and timestamps for the states). Listed in `access_table` as school-wide.
3. **The job** (R, moved out of `assess/`, which is pure): `engine/w3_read/nightly.py::nightly(conn, now=None) -> dict`:
   take a `pg_advisory_lock` (a second call while one runs returns `{"skipped": true}` and writes nothing), take the
   "before" numbers, call `assess.graph.rebuild(conn)` in the one transaction (so a reader never sees half a rebuild),
   take the "after" numbers, insert one `graph_run`. On error: roll back the rebuild, insert an `ok=false` row, re-raise.
   `now` is the run's clock only: it sets `started_at`/`ran_at` and so the watermark; production passes nothing and
   `POST /graph/nightly` accepts no `now`. `engine graph --nightly` extends the existing `engine graph` (`cli.py`). The
   route lives in the existing `api/routes/graph.py`, through `run_idempotent`. A full rebuild (283 states today) is
   cheap and cannot drift from the rule the way an incremental one can.
4. **Unplanned** (R): `public.unplanned_sessions(p_campus uuid, p_from date, p_to date) returns integer`, security
   invoker: sessions of classes on that campus on `school_day.on_date` in range with `state = 'done'` and
   (`planned = false` **or** `plan_entry_id is null`; a planned session with no plan line counts, an unplanned one with a
   line counts). `_counts` passes the `week` and `today` it already computes. `unplanned` becomes an `int`, `unplanned_why`
   is removed from `api/routes/k2.py` (lines 55-56) and `k2_reads.py`; `tests/test_k2_reads.py` (157-163) changes with
   it; the builder greps `apps/web` for any reader of either field. A class-day with no sessions is not "unplanned".
5. **Item 7** (R, rewritten). Two parts:
   - **The 20 real notes**: counted from data, never by a person reading a count: distinct `confirmation_id` of
     `activity_observation` with `route in ('form','voice')`, `stored_at >= config cp9.real_notes_from` (a date the
     builder sets at deploy; absent means the proof fails saying so), in K2 classes, `confirmed_by` holding an educator
     grant in `staff_role_grant`. The builder verifies the two route codes exist in `observation_route`.
   - **The hand calculation**: `hand_check(id, tenant_id, child_id, skill_code, grade_code, expected_state, system_state,
     matches, checked_by, checked_on)`, append-only. It is written by `engine graph --hand-check` (engine login), which
     reads the system's state at that moment and stores it with `matches` in the same row, so a later change of the
     system cannot make an honest old row wrong, and nobody can edit a row to match. `child_id` only (rule 6); the proof
     prints counts. Listed in `access_table` as child data.
   - The proof passes when notes >= 20, distinct children in `hand_check` >= 5, and every row `matches`. It is box-only
     and **cannot pass before a person does that work**; it is a manual acceptance gate that the build cannot close.

## Items and their proofs
| # | Proof | Kind |
|---|---|---|
| 1 | With a clock: evidence made on day D (explicit `created_at`) is absent from the picture; `nightly(now=D+1 02:30)` creates the picture row and one `graph_run`; evidence created after that `now` is not in that run's digest and appears in the next. Run as the engine login (`app_engine`). Two concurrent calls write one row. The n8n file is a daily schedule trigger between 00:00 and 05:00 IST with one HTTP node to `/graph/nightly` (with an Idempotency-Key) and no Code node. LIVE: a `graph_run` with `ok` exists within `graph.nightly_stale_hours`. | test + box |
| 2 | Correct through `voice_confirm.correct` and the registered route: new row with `supersedes` and `reason`; old row byte-identical (`to_jsonb` before/after), cannot be updated or deleted; old evidence untouched; after `nightly` only the correction counts in the picture; a second correction of the same row is refused (409). | test |
| 3 | `unplanned_sessions`: counts done sessions with no plan line and done sessions marked unplanned; a planned session with a line, a not-done session and another campus's session do not count; zero with none; `_counts` returns an int and the null/why wording is gone from the code and the response model. | test |
| 4 | Evidence with `confirmed_by` null never reaches `child_observed_state` or `child_skill_state`; evidence from a drafted voice note is refused by the database; confirmed evidence of the same child does. | test |
| 5 | Scope: written answers (`item_result`). Three results for one child and skill: blank, wrong with `working_shown='none'`, wrong with `working_shown='partial'`. After `nightly` the three `item_result` rows are unchanged, their evidence rows carry marks blank / wrong / wrong linked by `item_result_id` to three distinct (`status`, `working_shown`) pairs, and the graph's signals function (`graph_functions.sql`, "blank / wrong / correct") reports blank apart from wrong. The observed yes/sometimes/not_yet scale is out of scope for this rule. | test |
| 6 | Throwaway database with evidence and both kinds of state: two nightly runs leave `evidence_digest_before = after` and `states_digest_before = after` and the states equal to a fresh rebuild. LIVE (read-only): every `graph_run` has both digests equal; the first run (lowest `started_at`) has evidence and state counts equal before and after; counts printed. | test + box |
| 7 | As decision 5. LIVE, read-only, box only, counts only. | box (manual gate) |

Migration (`supabase/migrations/2027…_nightly_picture.sql`): `graph_run`, `hand_check`, `unplanned_sessions`, the config
rows, `access_table` rows (before `apply_conventions()`). Additive; no existing row is read or written differently.
Written to run twice.

## Preconditions to re-check at build time (CP-4 is not built)
(a) `access_table` exists and `apply_conventions()` raises for an unlisted table; (b) the engine login keeps `engine_all`
on every table (CP-4 item 6). If either differs when CP-4 lands, the migration and the engine-role test change, not the
scope.

## Constraints kept
Rule 4 (evidence is append-only: the job writes `graph_run` and rebuilds ring B only), rule 5 (item 5), rule 1 (the 02:30
time lives in the n8n file; the 26-hour window and K2 grade code are config rows or the proof's own, not engine
constants), rule 6 (`child_id` only; the run error text carries no names), `workflows.json` (the new files are listed
under N10, hand-overs declared; `test_layout.py` stays green).

## For Nimish (plain)
- The nightly job is a file in the repository; **someone must import it into n8n on the box and give it the engine key**.
  Until then item 1's LIVE proof fails. I do not know whether n8n is running on the box today; worth verifying first.
- Item 7 needs two people's work: the K2 educator confirms 20 real notes on the typed form, the coordinator calculates 5
  children by hand and the builder enters them with the command above. It is a manual gate; the build cannot finish it.
- A date, `cp9.real_notes_from`, must be set when this goes live, so "real" notes are told from test ones.

## Open questions
1. **1,838 and 283** are counts at one moment and live evidence grows. The proof asserts the rebuild changed nothing it
   should not have (digests equal, counts before = after on the first run) and prints the counts. Is that the intent?
   (Recommended: yes.)
