# CP-14 design: skill links a person confirmed, and "ready next" per activity

EGM artifact directory: specs/CP-14/design-review

Status: REVISED after goldfish review (zoom-out, codebase-details, implementation-readiness; dispositions in
`specs/CP-14/design-review/summary.md`). Scope: `specs/CP-14/spec.md`. Tier 3 (a migration; changes what a child's
page claims). Waits for CP-13 (merged). Plan row: `docs/backend-plan.md` CP-14; roadmap tasks M1-15, M1-17;
reconciliation package 7, line 4.

## The problem

"Ready next" tells an educator which skill a child can move on to, from links of the form "A comes before B". The
machinery is built (M1-15, M1-17) but has never said anything to anyone:

- **No link is confirmed.** `skill_link` (links between the broad skills K2 uses) is empty on live; the educator's
  "A before B" list never arrived. Readers see confirmed links only (ADR 0099), so "ready next" is empty for every child.
- **Confirming is impractical.** `engine skill-links confirm <id> --by <email>` takes one internal id at a time. Nobody
  can see the ids; a list of 100-plus links would mean 100-plus commands.
- **A person cannot say no.** A proposed link can only be confirmed. A wrong confirmed link cannot be taken back (ADR
  0099 left it unbuilt). A wrong *hard* link hides a skill from every child's "ready next"; today the only fix is a hand
  edit of the live database, which the rules forbid.
- **"Ready next" is per skill only.** Educators choose activities, in fortnights. The roadmap asks for "ready next" per
  activity as well (reconciliation package 7).

## Goals

1. A person confirms a reviewed list in one step, by skill pairs, not ids; every confirmed link names that person.
2. A person can withdraw a link, proposed or confirmed, with a reason. It stops counting at once; who confirmed it before
   stays on record.
3. The child page read (`POST /k2/child`) gains `ready_activities`: the activities of the child's grade that are ready
   next, each with the ready skills that make it so.
4. On live: the educator's list is loaded, and every K2 link has a person's decision (none left proposed).

## Non-goals

Any screen. A model proposing links (CP-16). Links between maths micro-steps (`skill_prerequisite`): no K2 reader uses
them. A "not ready" list (M1-17, D-008: a child not seen is not "not secure"). The child-level rule (CP-13). Marking which
fortnight an activity is planned in: only 40 of 375 plan lines name an activity until CP-8, so it would almost always be
empty; it belongs with or after CP-8.

## What exists (read from main)

| Piece | Where |
|---|---|
| `skill_link`, `link_strength`, `link_status` (`confirmed` boolean), views `skill_link_confirmed` / `skill_link_audit`, ring refusal, `propose_skill_link`, `confirm_skill_link`, trigger `internal.skill_link_confirmation` (shared with `skill_prerequisite`) | `supabase/migrations/20270103090000_skill_links.sql`; search paths pinned by `20270110090000_pin_function_search_paths.sql` (CP-5) |
| `engine skill-links load <csv>` / `confirm <id> --by` | `engine/w3_read/skill_links.py`, commands in `engine/w3_read/cli_skill_links.py` (listed in `workflows.json` on N10) |
| `ready_next(links, states, done_states)` | `engine/w3_read/k2_growth.py` (N9) |
| Child page read with `growth`, `ready_next`; config row `k2.child_page` (`done_states` ["secure"]) | `engine/w3_read/k2_picture_reads.py` (N9, 270 lines), `supabase/seed/config.json` |
| Activity → skill | `activity_skill (tenant_id, activity_code, skill_code)`; `skill_code` references `registry_skill` (the table `skill` was renamed, `20261201090000`), the same codes `skill_link` uses. `activity.band` is the grade. |
| Edit history | `curriculum_edit (tenant_id, record, code, field, before, after, changed_by)`; `record` limited by `curriculum_edit_record_check` (`20261230090000`); who = setting `app.changed_by` |
| Who may read raw link tables | `tests/test_skill_links_confirmed.py`: only seeders name `skill_link`; only `checks/links.py`, `checks/scenarios_links.py` read `skill_link_audit` |

## Technical plan

### 1. Confirm a reviewed list by pairs (goal 1)

`engine skill-links confirm --file <csv> --by <email>` takes **the same file that was loaded** (read with the existing
`skill_links.pairs()`; only `before_code` and `after_code` are used). `confirm <id>` and `confirm --file` are mutually
exclusive; one is required. All or nothing: any pair that is not `confirmed` or `already` raises `Refused("line N: …")`
and the caller's transaction leaves nothing written, as `load` does. Output: counts of confirmed and already.

New database function `confirm_skill_link_pair(p_tenant, p_before, p_after, p_staff) returns text` finds the link and
calls `confirm_skill_link`. Words: `confirmed | already | no link | not staff | same person | no confirming state`.
`not staff` also covers a staff member of another school.

**Who may confirm (decision N1).** If Nimish chooses (b): `skill_link.proposed_by uuid references staff(id)`;
`load` requires `--by <email>` and records it; `confirm_skill_link` returns `same person` when the confirmer is the
proposer of a `skill_link` row (the rule does not touch `skill_prerequisite`, which has no proposer). A fixed rule, not a
setting: it is a safety rule, and a true/false row would double the paths to test for a value nobody plans to flip. Rows
loaded before CP-14 have `proposed_by` null and the rule does not fire for them. If he chooses (a), none of this is built.

### 2. Withdraw a link (goal 2)

`engine skill-links withdraw --before <code> --after <code> --by <email> --reason "<text>"`, through one function
`withdraw_skill_link(p_tenant, p_before, p_after, p_staff, p_reason) returns text`. Words:
`withdrawn | already withdrawn | no link | not staff | blank reason`.

- **Proposed or confirmed** links can be withdrawn. "Withdrawn" means "a person said no". This is how a reviewer rejects
  a pair, without a false confirmation first.
- New vocabulary row `link_status ('withdrawn', ord 2, confirmed false)`, added inside
  `internal.skill_link_vocabulary`; the migration re-runs it for every existing school (it is `on conflict do nothing`).
- New columns on `skill_link`: `withdrawn_by uuid references staff(id)`, `withdrawn_reason text`, and a table CHECK
  `withdrawn_by is null or btrim(coalesce(withdrawn_reason, '')) <> ''`. The shared confirmation trigger is **not**
  changed (it also runs on `skill_prerequisite`, which lacks these columns). Withdrawing clears `confirmed_by` and
  `confirmed_at`, as that trigger already requires.
- Confirming again (a later change of mind) sets `withdrawn_by` and `withdrawn_reason` back to null; the history keeps
  both.
- **History.** `curriculum_edit_record_check` is dropped and re-added with `'skill_link'`. A new trigger function
  `internal.skill_link_kept()` on `skill_link`, after insert or update, writes one `curriculum_edit` row per changed field
  among `status, proposed_by, confirmed_by, confirmed_at, withdrawn_by, withdrawn_reason`, with record `skill_link` and
  code `before_code || '>' || skill_code`. `confirm_skill_link`, `confirm_skill_link_pair` and `withdraw_skill_link` set
  `app.changed_by` (local to the transaction) to the staff id, so the history names the person, not the database role.
  `curriculum_edit` is append-only, so "confirmed by X on day D, withdrawn by Y on day E because …" is always readable.
- `skill_link_confirmed` already shows only confirming states; no reader changes.

### 3. Ready next per activity (goal 3)

A pure function `blocked(links, states, done_states) -> set[skill]` is added beside `ready_next` in `k2_growth.py`; the
hard-link test inside `ready_next` (`k2_growth.py:47`) uses it, so both read links the same way. `ready_next`'s output is
unchanged. A second pure function `ready_activities(activity_skills, ready, blocked)` returns the ready activities.

**Rule** (mechanical): an activity is ready next for a child when at least one of its skills is in `ready_next`, and none
of its skills is blocked. A skill is blocked when it is not done and a confirmed **hard** link before it is not done. A
skill with no confirmed link neither makes an activity ready nor blocks it (M1-17: no link, no claim). A skill already
done neither helps nor blocks.

**Read.** `POST /k2/child` adds `ready_activities: [{activity:{code, name}, because:[{code, name}]}]`, sorted by activity
code. Activities are those with `activity.band = where["grade_code"]` (the class's grade, already in the read); the build
first checks that `activity.band` values are grade codes (`K2`). One more query per page (the grade's activity skills), a
fixed number whatever the class size; the query budget test moves from 9 to 10. The page stays 403 while
`voice.screens_enabled` is off, as today.

### 4. The real list on live (goal 4)

People's steps: the K2 educator writes the list in `load`'s columns; it is loaded with `--by`; the confirmer runs
`confirm --file` and `withdraw` for each pair they reject. The reviewed file is not kept in git (it is the school's
working file, holds no names, but it changes); its line count is written in `docs/notes/CP-14.md`.

The count is a new `engine links check --k2` line in `checks/links.py` (the one file allowed to read `skill_link_audit`):
links whose two ends are both skills of K2 activities, by status. Proof on the box (`check_box`, read-only, counts only):
the total is above zero and the `proposed` count is 0. No seeder writes `skill_link`, so no seed row can fail it.

### Flow

```
educator's list.csv --load --by-->  skill_link: proposed (proposed_by)
          --confirm --file --by-->  confirmed (confirmed_by) --> skill_link_confirmed --> ready_next --> ready_activities
          --withdraw --reason--->   withdrawn (every change kept in curriculum_edit)          (POST /k2/child)
```

## Alternatives considered

- **Confirm every link on load.** Rejected: a script would give the school's word (ADR 0099).
- **A separate `skill_link_decision` table.** Rejected: a new base table (needs a CP-4 `access_table` row) and a second
  source of the current state. `curriculum_edit` already keeps field history for the other curriculum links.
- **A separate "rejected" state for proposals.** Rejected: "withdrawn" with a reason says the same; one word fewer.
- **Delete a wrong link.** Rejected: DELETE is revoked; a decision is never erased.
- **An activity is ready only when all its skills are.** Rejected: a K2 activity maps to 1–4 skills, often one already
  secure; "all" would almost never fire. "At least one ready, none blocked" matches how an educator picks an activity.
- **A setting to switch the confirmer rule.** Rejected in favour of a fixed rule (see §1).

## Dependency on CP-4 (named)

No new base table: columns on `skill_link`, a vocabulary row, a CHECK widened on `curriculum_edit`, one trigger, two new
functions and two redefined ones. `skill_link`, `link_status`, `curriculum_edit` are already on CP-4's table list (school
wide). Any table the build adds would need an `access_table` row once CP-4 lands. After CP-4: one test that the child page
read still returns `ready_activities` for an educator of the class (deferred until CP-4 merges). The proofs build on the
throwaway database (CP-20) from every migration present, so they run before and after CP-4.

## Detailed implementation plan

The build chooses the migration timestamp; none is chosen here.

| File | Change and why |
|---|---|
| `supabase/migrations/<next>_skill_link_decisions.sql` | `withdrawn` row in `internal.skill_link_vocabulary` + re-run for every tenant; columns `proposed_by` (if N1 = b), `withdrawn_by`, `withdrawn_reason` + CHECK; widen `curriculum_edit_record_check`; `internal.skill_link_kept()` + trigger; new `confirm_skill_link_pair`, `withdraw_skill_link`; redefined `confirm_skill_link` (clears withdrawn columns, sets `app.changed_by`, `same person` if N1 = b) and `propose_skill_link` (optional proposer: drop the 5-argument version first so the call is not ambiguous). Every function keeps `set search_path = public` (CP-5). Grants to `app_engine` only; ends with `internal.apply_conventions()`. |
| `packages/engine/engine/w3_read/skill_links.py` | `load(conn, path, by)`, `confirm_file(conn, path, by)` (uses `pairs()`), `withdraw(conn, before, after, by, reason)`; words for each refusal; no SQL about the link tables. |
| `packages/engine/engine/w3_read/cli_skill_links.py` | `load --by`, `confirm --file` (exclusive with the id), `withdraw`. |
| `packages/engine/engine/checks/links.py` | `--k2` counts by status through `skill_link_audit`. |
| `packages/engine/engine/w3_read/k2_growth.py` | `blocked()`, `ready_activities()`. |
| `packages/engine/engine/w3_read/k2_picture_reads.py` | the activity-skills query; `ready_activities` in the child read. |
| `packages/engine/engine/api/routes/k2.py` | response model gains `ready_activities`. |
| `workflows.json` | N10 commands: `skill-links load`, `skill-links confirm`, `skill-links withdraw`, `links check` (as `test_layout.py` expects). |
| `packages/engine/engine/checks/rules.json` | regenerated (`engine live rules --write`): new CHECKs and the widened one. |
| tests: `test_k2_growth.py`, `test_k2_child_growth.py`, `test_skill_links.py`, `test_k2_picture_reads.py` (budget 9 → 10) | hand-worked tables for the activity rule; confirm by file, withdraw proposed and confirmed, same person (if b), history rows, reconfirm. |
| `docs/adr/<next>-…` | withdrawal and the confirmer rule, extending ADR 0099. |
| `docs/notes/CP-14.md` | the branch note: list line count, live counts after the people's steps. |

## Decisions

### For Nimish (what the school sees, or what is safe)

- **N1. Who may confirm a link.** (a) Anyone on the active staff list, including the person who wrote the list (today);
  (b) a different member of staff from the person who loaded it. **Recommend (b)**: a wrong hard link hides a skill from
  every child's "ready next" with no warning, and the school already uses two people for report lines. Cost: the
  coordinator (or another educator) must read the K2 list before anything shows.

### Mechanical (decided, with reason)

- M1. Confirm by pairs from the loaded file: people know skills by code; one file, no second format.
- M2. History in `curriculum_edit` via a skill-link trigger: one append-only home for curriculum edits.
- M3. Withdraw covers proposed links: rejecting must not need a false confirmation.
- M4. Activity rule "one ready, none blocked"; activities of the class's grade (`activity.band = school_class.grade_code`).
- M5. Sort by activity code; a screen sorts as it likes later.
- M6. Fortnight mark deferred to CP-8's data (non-goal above).
