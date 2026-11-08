# CP-8 design: every period opens its activity

Status: reviewed by three fresh reviewers (simplicity, design, codebase accuracy); their blockers are applied below.
Written unattended (no author gates), so mechanical choices are mine, recorded with reasons; the two that are Nimish's are
under "Decisions for Nimish". Read with `specs/CP-8/spec.md`. Reports: `specs/CP-8/design-review/`.

## Problem
`plan_entry` has one row per line of a class's fortnight plan (375 for K2). The loader (`k2_timetable_sql.py`, the
`plan_entry` insert) sets `activity_id` only when the line's text, reduced to lower-case letters and digits, equals exactly
one activity name of the class's band. 40 lines pass. The other 335 open nothing and nothing says why. No record says what
linked a line, and no list names the lines left over.

## Goal
Every K2 plan line is linked, or visibly on a named list with a reason. Every link says which rule made it. A run of linking
can be undone as a whole. The system writes no activity text (CP-15) and guesses no tie.

## Dependency on CP-4 (named)
CP-8 waits for CP-4 (`docs/backend-plan.md`). CP-2, CP-3 and CP-4 are built one at a time, so the proofs are written against
main's schema now plus what CP-4 adds that CP-8 touches:
- CP-4 sorts tables into `child_data` / `school_wide` in `access_table`, and `apply_conventions()` raises on an unlisted base
  table. CP-8 adds **no base table** (see decision 1), so it adds no row there. CP-4's own rule 2 (a `school_class_id`
  column means `child_data`) classifies `plan_entry` as child data keyed by class; CP-8 adds columns to that table and two
  views over it, so educators will see only their own classes' lines. The views are `security_invoker`, so the role rules
  on `plan_entry` apply through them. After CP-4 the build must check this on the throwaway database, as one test.
- The proofs do not need CP-4 to exist: they build their rows in one rolled-back transaction on the throwaway database
  (CP-20) as the migration owner, and run today. Only the build is held until CP-4 merges.
- CP-4 follow-ons the build must do: regenerate `engine/checks/rules.json` (`engine live rules --write`, because
  `plan_entry` gets a constraint); keep `test_roles.py` green.

## Mechanical decisions (recorded, with reasons)
1. **No new base table. Four columns on `plan_entry`, two views, two functions** (one migration, additive, written to run
   twice). Reason (review): the proposal ledger already tracks machine-made links by a run id column and undoes by it
   (`20261230090000_curriculum_proposal_ledger.sql`); a new run table and a stored unmatched table each added states that go
   stale (a loader reload, a CP-15 activity, an undo) and each pulled in CP-4's table list.
   - `plan_entry.link_rule text`, `link_run uuid`, `linked_at timestamptz`, `linked_by text`. Constraint
     `(activity_id is null) = (link_rule is null)`: a link always names its rule. The migration first tags the 40 existing
     links `link_rule = 'exact_name'` (`link_run` null, `linked_by = 'loader'`), so "which rule linked each line" is true for
     every line from day one; the loader insert is changed to set `link_rule` with the activity it sets.
   - A before-update trigger on `plan_entry`: when `activity_id` changes and the same statement did not set `link_run`, it
     sets `link_run = null`, `link_rule = case when activity_id is null then null else 'person' end`. A hand edit therefore
     leaves a run, and undo never touches it.
   - View `plan_line_candidate (plan_entry_id, activity_id, rule, rank)`: for each line with `activity_id is null`, every
     activity of the class's band that a rule matches. Rank 1 is `exact_name` (the loader's rule). Further rules are
     added by later migrations only after the box dry run (decision 3).
   - View `plan_unmatched (plan_entry_id, tenant_id, school_class_id, fortnight_id, plan_key, text, reason, candidates)`:
     every line with `activity_id is null`, computed live, so none can be silently unlinked and it cannot go stale.
     `reason`: `no_match` (no candidate at any rank), `several_matches` (two or more at the best rank: a person picks),
     `ready_to_link` (exactly one at the best rank: a run has not been applied yet). `candidates` is the count at the best
     rank.
   - Function `plan_link_apply(p_tenant uuid, p_band text, p_by text) returns uuid`: takes `pg_advisory_xact_lock` on
     (tenant, band), then in one statement links every line with exactly one candidate at its best rank where
     `activity_id is null` (so it never changes an existing link), setting `link_rule` = that rule, one new `link_run`,
     `linked_at`, `linked_by`. Returns the run id (also when it links nothing).
   - Function `plan_link_undo(p_run uuid, p_by text) returns int`: in one statement sets `activity_id`, `link_rule`,
     `link_run`, `linked_at`, `linked_by` back to null on exactly the rows with that `link_run`; returns the count. A second
     undo finds no rows and returns 0. A line a person changed after the run no longer carries the run id, so it is not
     touched (the trigger above). Both functions: `revoke … from public`, `grant execute … to app_engine` only.
   - After an undo the lines are unlinked again and on `plan_unmatched` at once, because the list is derived. This fixes
     the reviewers' blocker (undo leaving lines unlinked and unlisted).
2. **Tie rule.** For each line, the best rank is the lowest rank at which any activity matches. Exactly one at that rank
   links; two or more lists as `several_matches`; a looser rank is never tried once a stricter one has candidates. A tie is
   never broken by code.
3. **More rules need evidence.** Today only `exact_name` exists, and the loader already applies it, so a first run of the
   machinery alone will probably link few or none of the 335. The first build step is the read-only dry run on the box
   (`engine timetable link`, counts only by reason, and for candidate rules the count with 0, 1, 2+ matches). Its
   numbers go to Nimish. A further rule (for example the activity's name plus a trailing number) is added only if the dry
   run shows it yields one match for many lines and never links a line a person would not accept. If none does, item 1
   under the default passes with a low percentage and the real fix is CP-15; the design says so rather than hiding it.
4. **Concurrency.** One transaction per apply and per undo; the advisory lock stops two applies racing; the update's
   `where activity_id is null` plus the rowcount returned stop an overwrite.
5. **Engine surface, thin.** In `engine/w2_print/cli_timetable.py` (the `timetable` group, where the loader's command lives): `engine timetable link` (dry run: counts of
   lines, would link by rule, listed by reason; `--apply` writes via `plan_link_apply` and prints the run id),
   `engine timetable link-undo RUN_ID`, `engine timetable unmatched` (plan key, line text, class section, reason). Plan
   line text is school curriculum text; no person's name is read or printed. The commands go in `workflows.json` N4's
   `commands`; `test_layout.py` is unchanged (it reads the map).
6. **"A person picks"** a line from `several_matches` or `no_match`: out of CP-8. A pick is an update of `activity_id`
   (the trigger records it as rule `person`); the screen or command for it belongs to the frontend / CP-15 / CP-16.
7. **Scope of a run:** one tenant and one band (default K2), all fortnights. FN10 (item 3) is a filter on the same rows.
8. **Item 3's "lesson period"** is a `session` row that is `planned`, in a non-fixed `period`, on a `school_day` between
   Fortnight 10's `starts_on` and `ends_on`. It opens an activity if its `plan_entry` has an `activity_id`, and is on the
   unmatched list if its `plan_entry` is in `plan_unmatched`. A lesson period with **no** plan line (`plan_entry_id` null; the
   loader's session insert uses left joins, so it can happen) is neither, and fails item 3; the live proof prints that
   count by name. I have not seen the live count. If it is not zero, the build must stop and ask (stop rule), not
   reinterpret the scope. FN10's lines are split into weeks A and B by `plan_entry.week_code`; the session already points
   at its own line, so the week needs no extra rule.
10. **The fortnight is the unit of report** (relayed from Nimish via the orchestrator, 8 Nov). Every count the commands and live
   proofs print is also given per `fortnight.number` (via `plan_entry.fortnight_id`, with week A/B from `plan_entry.week_code`):
   lines, linked, listed by reason. "FN10" in item 3 is the `fortnight` row numbered 10 (23 Nov to 7 Dec on the
   Graph tab; the sheet's Fortnights 10 and 11 disagree on the end date, so item 3 uses the stored `starts_on`/`ends_on`
   as they are and does not correct them). No new fortnight table or column: the existing `fortnight`, `plan_entry.fortnight_id`
   and `week_code` are reused.
9. **No live writes from a session.** Every LIVE proof is `check_box`, read-only, prints counts only. The apply run on live
   is a deploy-time step by Nimish or the box.

## Measuring item 1
Denominator: all K2 `plan_entry` rows (the issue's 375). If the dry run shows some of them are headings and not lessons, the
denominator is fixed before the build, and Nimish told. Default target, used because none is set: **no line with a match is
left unlinked**, i.e. `plan_unmatched` holds no `ready_to_link` line after the run; the share `linked / total` is printed
beside it. The proof also reads an optional line `Target: <n>%` in `docs/decisions/CP-8-link-target.md`; when present it
requires the share to reach it. The file is Nimish's to write; I do not write it.
Limit to know: right after an apply, "no `ready_to_link`" is true by construction. What the number really measures is the
dry run's rules, so item 1 under the default can pass at 40 of 375. That is why decision 1 below asks for a real target.

## Decisions for Nimish
1. **The item 1 target** (default used, please confirm or set a number). Default: every line that has exactly one matching
   activity is linked. Risk above: it can pass while the clickable share stays near one in nine. The box dry run (decision 3)
   gives the number that lets you set a real percentage; if the honest ceiling is low, the fix is writing the missing
   activities (CP-15).
2. **Item 5, open, not decided by me:** may a draft marked "not written yet" be shown to educators? Facts: a part of an
   activity page is school text, agent-drafted or a person's (`activity_part_source`), and a drafted part is marked
   until a person keeps, changes or rejects it (D-071). Linking more lines sends educators to pages that may be drafts
   or have empty parts. Options: (a) show it, marked "not written yet"; (b) hide it and keep the line on the unmatched
   list; (c) show only the parts the school wrote. I have no recommendation I can defend without knowing how educators use the
   day: (a) risks reliance on a draft; (b) means linking gains nothing visible. The answer goes in
   `docs/decisions/CP-8-not-written-draft.md` as `Decision: show | hide | school-text-only` and `Decided-by: Nimish`.
   Item 5's proof fails until that file exists, so CP-8 cannot finish before he decides. No screen is built either way.

## Implementation list (files)
- `supabase/migrations/<next>_a_plan_line_knows_what_linked_it.sql`: columns, tagging of the 40, constraint, trigger, two
  views, two functions with grants, `select internal.apply_conventions();`.
- `packages/engine/engine/w2_print/k2_timetable_sql.py`: the `plan_entry` insert sets `link_rule`.
- `packages/engine/engine/w2_print/cli_timetable.py`: the three commands (check its line count against its ceiling in
  `workflows.json`; if near, put them in a new `cli_plan_link.py` mounted the same way).
- `workflows.json`: the commands on N4. `packages/engine/engine/checks/rules.json`: regenerated.
- `packages/engine/tests/test_plan_link.py`: the unit and database tests. `docs/notes/CP-8.md`: the branch note.
- Item 6's proof is the existing suites, run unchanged (as `specs/CP-5/proofs/tests_unchanged.sh` does).
- Not touched: the Monthly Planner, any `apps/web` screen, `STATE.md`, `HANDOFF.md`.

## Alternatives considered
- **Three new tables (run, link, unmatched).** Rejected by author after review: more states to go stale, a hole where undo
  leaves a line unlisted, and a CP-4 table-list entry each, for no behaviour the columns lack.
- **Fuzzy or model matching to raise the share.** Rejected by author: a wrong link sends an educator to the wrong activity
  without telling them; an unlinked period is at least listed. A model may propose matches onto the list later (CP-16).
- **Linking inside the loader only.** Rejected by author: it keeps no run and cannot be undone as a whole.

## Risks not verified
- No live data seen: how many of the 335 have a match, whether any lesson period lacks a plan line, whether some of the 375
  are headings.
- The `security_invoker` views assume the database is Postgres 15 or later (Supabase); verify on the throwaway database.
- The spec text still opens with the issue's line "DRAFT for Nimish. Not locked." although the issue carries the
  `scope-locked` label; copied verbatim as the scope requires.
