# CP-17 design: inventory (stock and issue records, rupee threshold, educator approval of the fortnight's list)

Status: REVIEWED: EGM stages 5 to 9 (initial zoom out, comprehension, critic, intermediate zoom out, implementation
readiness); reports in
`specs/CP-17/design-review/`. Plan: `docs/backend-plan.md` row CP-17 (roadmap task M1-13; tier 3). Waits for CP-6 and
CP-4. No staff or child name appears here or in the proofs; "who" is a staff id.

## Terms
- **CP-n**: a scoped change in `docs/backend-plan.md` (CP-4 access rules, CP-6 fortnight cycle, CP-18 sending lists).
  **M1-n**: a roadmap task. **C5**: the earlier slice that built the school's one approval list. **Tier 3**: a change
  to the database, money or approvals; it gets the full scope, proofs and independent review.
- **Open grant**: a `staff_role_grant` row (`staff_id`, `role_code`, `school_class_id`, `valid_from`, `valid_to`) with
  `valid_from <= today` and (`valid_to` null or `>= today`), where today is the school's date,
  `(now() at time zone <the school's school.time_zone config>)::date` (as the engine's `school_today`); "on a class" means its `school_class_id` is that class
  (`supabase/migrations/20261225090000_people_and_enrolment.sql:121`).
- **LIVE**: a read-only check run on the production server after deploy, not in CI.
- **H1** (the harness's "present both readings", `.claude/athena/CLAUDE.md`) and **R10** ("reuse before write",
  `CLAUDE.md`). The design's own rules below are **D1 to D9**. `athena block CP-17` stops the build and records why.

## Wording
`docs/backend-plan.md` says "the **month's** list". Nimish decided on 08-Nov-2026 that the fortnight is the planning
unit, and the school's own files plan by fortnight (`supabase/seed/k2_tabs_2026_11_04/calendar.csv` "Fortnight Dates",
`planner.csv` "Fortnight 1".."Fortnight 17", `frame.csv` "Fortnight time table, Week __"). CP-17 therefore approves each
class's **fortnight** list. The monthly school-wide consolidated list (`materials_consolidated`, roadmap M1-16) is
unchanged. "M1-13" also names the curriculum screens elsewhere (`apps/web/lib/curriculum-screens.ts:8`); here it means
the roadmap's inventory task only.

## Two readings of "rupee threshold" (H1)
- **A (chosen): the threshold decides which items are tracked in stock.** The only requirement relayed into this
  repository says so: "items above a rupee threshold are tracked, so your catalogue item needs a 'home' (class or school)
  and a unit rate/value field that may be empty (never invent a price)" (`goals/m1-11-k2-complete-v1.yaml:38`). The
  migrations that built the materials list name the gap the same way (`20270102090000_materials_list.sql:21`,
  `20270104090000_materials_consolidated.sql:15`).
- **B (rejected): the threshold decides which list lines need approval.** Nothing in the repository says this, and under
  B a list of cheap items would go out unapproved, against "educator approval of the list".

## Problem
The school has no record of costly materials: what came in, which class has what, what was lost. Anything with a price,
however cheap, counts as "tracked". And a class's materials list can be sent with nobody who teaches the class having
looked at it, including after the system has rebuilt it.

## What exists (read from the repository)
- `material_item(tenant_id, code, name, unit, home in class|school (null until a person says), unit_value numeric >= 0
  ("rupees for one unit; empty until a person says, never guessed"))` (`20270101090000_k2_page_parts.sql:41-53`).
- `materials_list(school_class_id, period in day|week|fortnight, from_on, to_on, state in draft|sent)`, `materials_line`
  (unit, quantity (may be null), needed_on, removed_at; unique per list and material code) and the append-only
  `materials_line_edit` (educator edits only) (`20270102090000_materials_list.sql:25-82`). The list is **rebuilt by
  code** (`w2_print/materials_list.py:79-106`), which inserts, updates and deletes lines with no edit row.
- Sending (`w2_print/materials_send.py:55-77`): locks the list row, inserts a `materials_send` row, and sets
  `state = 'sent'` **only** for the WhatsApp route; an email send leaves the state alone, and a re-send is sent to sent.
- "Tracked" today is `unit_value is not None` (`packages/engine/engine/api/routes/materials.py:211`,
  `packages/engine/engine/w2_print/materials_list.py:154`).
- One approval list (C5, `20261208090000_one_approval_list.sql`): `approval_kind` rows; the append-only `approval`
  (approved, or sent back with a reason); the `approval_list` view whose `firsts` branch is one row per approvable thing
  with who approved it first and when, joined to `approval_kind`.
- Settings: `config(tenant_id, key, value jsonb, description)` seeded from `supabase/seed/config.json`; role lists are
  bare arrays with `seed_once` (`materials.consolidate_roles`: "the roles whose open grant lets a person ...").
- `fortnight(academic_year_id, number, kind incl. teaching, starts_on, ends_on)` is on main
  (`20261231090000_k2_plan_and_timetable.sql:30`). CP-6 (not yet on main) adds `fortnight_cycle(state in
  planning|frozen|aligned|approved|list_sent)`, `fortnight_is_frozen(tenant, on_date)` (true for every state after
  planning). CP-3/CP-4 (not yet on main): `access_table(..., key_column, data_class child_data|school_wide, reason)`;
  `internal.apply_conventions()` raises when a base table has no row.
- No stock, quantity on hand, issue, purchase or threshold exists anywhere in schema or engine.

## Goals
1. One per-school setting says from how many rupees an item is "tracked" (marked on the class lists the educator
   approves). One function computes it.
2. For every item (by default; a setting can later limit it to tracked items) the school keeps a record of every unit that comes in, goes to a class, comes back, is counted or is
   written off. How many are on hand, and where, is the sum of those records and can never go below zero.
3. Each class's fortnight list is approved by an educator of that class, on the lines they were shown, before any send.
   Any change to its lines after approval, by a person or by a rebuild, means it must be approved again.

No money moves. Rupee values only label items.

## Non-goals
Any screen. Sending lists, reminders and moving the fortnight to `list_sent` (CP-18). The monthly consolidated list.
Purchases, orders, suppliers, invoices, payments. Entering rupee values. Automatic reordering. A second sign-off for
write-offs. Sending a list back with a reason. A command-line entry point (the one Python function CP-18 needs is the only code door).

## Data (the names are the contract the proofs use)
- Settings (`config` rows for every school, `seed_once`, `on conflict do nothing`, bare values):
  - `inventory.track_from_rupees` = `500` (placeholder; the school changes the row).
  - `inventory.record_items` = `"all"` (or `"tracked"`): which items may have stock records. Default all items
    (Nimish, 08-Nov-2026); a school tightens it with this row, not code.
  - `inventory.record_roles` = `["ops", "coordinator", "head"]`: the roles whose open grant lets a person write stock
    records.
  - `materials.approve_roles` = `["class_teacher", "educator", "subject_educator", "cover_educator", "coordinator"]`:
    the roles whose open grant lets a person approve a class's fortnight list. A grant tied to a class covers that
    class only; a grant tied to no class (the coordinator's) covers every class, so a coordinator can approve for an
    absent educator (Nimish, 08-Nov-2026).
- `public.material_is_tracked(tenant_id, material_code) -> boolean`: `unit_value is not null and unit_value >=` the
  setting. Raises when the setting is missing, not a JSON number, or below 0. An item with no value is never tracked.
- `stock_move(id uuid, tenant_id, material_code, kind, quantity numeric, class_id uuid null, counted_on_hand numeric
  null, counted_change numeric null, reason text null, who uuid, at timestamptz default clock_timestamp())`.
  Foreign keys `(tenant_id, material_code)` to `material_item`, `class_id` to `school_class`, `who` to `staff`.
  Append-only: `internal.forbid_change()` on update and delete, as `materials_line_edit`; truncate is already revoked
  from `app_web` and `app_engine` for every such table by `internal.apply_conventions()`
  (`20261021090000_each_service_its_own_role.sql:49-55`), and no truncate trigger is added because `engine live copy`
  empties every table (`20261226100000_voice_ledgers_like_evidence.sql:1-7`). Checks: `counted_on_hand is not null`
  exactly when `kind = 'counted'`; `class_id is not null` for `issued` and `returned`.
  One row is one event; `class_id` null means the school store:

  | kind | `class_id` | effect on stock |
  |---|---|---|
  | `received` | store or a class | `+quantity` there |
  | `issued` | required (the class) | `-quantity` at the store, `+quantity` at the class |
  | `returned` | required (the class) | `-quantity` at the class, `+quantity` at the store |
  | `written_off` | store or a class | `-quantity` there; reason required |
  | `counted` | store or a class | `counted_change` there |

  For `counted` the caller gives `counted_on_hand` (`>= 0`); the trigger sets `counted_change = counted_on_hand - on
  hand now`, and `quantity` stays null; any `counted_change` the caller sends is overwritten. Check: `(kind =
  'counted') = (quantity is null) and (quantity is null or quantity > 0)`.
- `stock_on_hand` (view, `with (security_invoker = true)`): per tenant, item and place, the sum of the effects in the table above (one `union all` per
  kind's sides). Never stored. A move between two places is one row, so a half-move cannot exist.
- A **fortnight list** is a `materials_list` with `period = 'fortnight'`. Lists are built per teaching fortnight, so its
  `from_on` and `to_on` normally equal one teaching fortnight's `starts_on` and `ends_on`; one that does not can never be
  approved (D6), so it can never be sent (D8), and the refusal says why.
- `public.materials_list_digest(list_id) -> text`: `md5(coalesce(jsonb_agg(jsonb_build_array(material_code, unit,
  quantity, needed_on, removed_at is null) order by material_code)::text, '[]'))`. Lines are unique per list and code,
  so the order is fixed; a null quantity is kept; an empty list has a digest.
- `materials_list_approval(id uuid, tenant_id, materials_list_id, class_id, lines_digest text, approved_by uuid,
  approved_at timestamptz)`. Append-only (as `stock_move`). The caller inserts `materials_list_id`, `approved_by` and
  `lines_digest` = the digest of the lines it showed the educator; the `before insert` trigger fills `tenant_id` and
  `class_id` from the list and runs every check of D6, including that `lines_digest` equals the digest now. All checks
  are in the trigger, so a direct insert is held to the same rules; no separate approve function is needed. An approval
  is **current** when its `lines_digest` equals the list's digest now.
- One approval list: an `approval_kind` row `materials_list` (ord 3, reaches_parent false, words "a class's fortnight
  materials list"), seeded both ways C5 seeds kinds: `create or replace` of `internal.approval_begins` with the new row,
  rerun for every existing school, and the same entry in `supabase/seed/vocabulary.json` (the loader,
  `engine/core/vocabulary.py:78-84`; `test_approval_list.py:62-66` checks they match). A `firsts` branch in
  `approval_list` gives each fortnight list (`target = id::text`) its earliest **current** approval (`first_by =
  approved_by::text`, `first_at`), empty when there is none. A separate `before insert` trigger on C5's `approval` table refuses kind `materials_list` (C5's own functions
  are left alone), so no send-back or second approval appears for it.
- `access_table` rows (CP-4): `stock_move` is `school_wide` (reason: stock of materials, holds no child data);
  `materials_list_approval` is `child_data` with `key_column = class_id` and the same `kind_code` and
  `key_type` as the `materials_list` row, read like the list it approves. If CP-4's check
  insists that a table with a class column is class-keyed, the builder runs `athena block CP-17`.

## The rules (database triggers; no application code decides)
- **D1 Which items.** Only when `inventory.record_items` is `"tracked"`: a `received` row, or a `counted` row for an
  item with no records yet, is refused for an item that is not tracked, naming the item and the threshold; so is a `counted` row that would add stock to an untracked
  item. Other kinds are bounded by what is on hand, so stock already recorded can still be moved, counted down or
  written off after the threshold or the price changes.
- **D2 Never below zero.** Every `stock_move` insert, of every kind, first takes one transaction lock per tenant and
  item, then refuses a row that would take any place below zero. Two moves at once cannot together take
  stock below zero.
- **D3 Reasons.** `written_off`, and `counted` with a non-zero change, are refused without a non-blank reason.
- **D4 Who may record.** `who` must hold an open grant, in the row's tenant, whose role is in `inventory.record_roles`.
- **D5 Same school.** `class_id`, `who` and any grant used must belong to the row's tenant; the approval's tenant is
  taken from its list, never from the caller.
- **D6 Approval.** The insert of an approval is refused unless: the list's `period = 'fortnight'` and its `from_on` and
  `to_on` equal one teaching fortnight's `starts_on` and `ends_on`; the approver holds an open grant on the list's class
  (or a grant tied to no class) with a role in `materials.approve_roles`; that fortnight is past planning (`fortnight_is_frozen`); and the `lines_digest`
  the caller sends equals the digest now, so an educator never approves lines they were not shown. Before the freeze the plan, and so
  the list, can still change. The trigger takes the list row `for update`.
- **D7 Any change voids approval.** Nothing is updated or deleted: if the lines change, the digest no longer matches.
  A trigger on `materials_line` insert, update and delete takes the list row `for share`, so a line change waits for
  any approval or send of that list in progress, and they cannot pass each other.
- **D8 No send without a current approval.** A `before insert` trigger on `materials_send` takes the list row `for share`
  and refuses a send of a fortnight
  list unless a current approval exists. This covers every route and every re-send. A trigger on `materials_list`
  refuses `state = 'sent'` on the same condition, as a backstop against a hand-written update that skips the send.
  Day and week lists are unchanged.
- **D9 Tracked is one rule.** The engine's two `unit_value is not None` checks become `material_is_tracked(tenant_id,
  code) as tracked` in their SQL; a missing setting makes both answer with an error. A search proves no other check of
  `unit_value` decides tracking in `packages/engine/engine` or `apps/web`. The website's `kept`
  (`apps/web/components/educator/materials-table.tsx:16`) only displays the engine's `tracked` value; it is not a rule.

## Names CP-18 depends on
CP-18's locked proofs (`origin/cp-18-scope:specs/CP-18/proofs/conftest.py`, `approve`) call
`engine.w2_print.materials_approval.approve(conn, list_id, who)`: approve a class's fortnight list as it reads now. CP-17
provides exactly that, in the new file `packages/engine/engine/w2_print/materials_approval.py`: it reads the list's
current `materials_list_digest` and inserts the `materials_list_approval` row for `who` (a staff uuid). It decides
nothing; the trigger (D6) does every check and its refusal propagates. Name and signature must not change without
telling CP-18. CP-18 also reads "a current approval" from the database rule (D8), not from this function.

## How this meets CP-6's cycle
CP-17 reads the cycle (approval only after the freeze) and changes no CP-6 step. Moving a fortnight to `list_sent` is
CP-18's, when its sends are recorded; CP-18 should require a current approval for every class's list first. CP-6's own
`approved` step (the fortnight's plan) is a different approval and is not tied to the lists here.

## Who approves what (tier 3: approvals)
| Act | Who | Kept as |
|---|---|---|
| Change the threshold or role lists | whoever may edit `config` today (unchanged) | the `config` row |
| Record stock in, out, back, counted, written off | roles in `inventory.record_roles` | `stock_move`, append-only |
| Approve a class's fortnight list | an educator with an open grant on that class, or a coordinator (any class); roles in `materials.approve_roles` | `materials_list_approval`, append-only; on the one approval list |
| Send the list | unchanged (CP-18), now refused without a current approval | `materials_send`, `materials_list.state` |

## Decisions
Decided by Nimish, 08-Nov-2026 ("Do not restrict the coordinator from these things right now. If you want data, or we
can think about rules later."), relayed by the orchestrator:
1. A coordinator may approve a class's list for an absent educator (in `materials.approve_roles` by default).
2. Write-offs need no second sign-off; each needs a reason and is kept for good.
3. Stock is recorded for all items by default (`inventory.record_items` = `"all"`). The rupee threshold stays a setting
   that marks tracked items on the lists; a school can limit stock records to tracked items later with the row.

Mechanical (decided here, reason given):
- Default threshold ₹500 and the role lists are placeholders in settings rows; proofs check the settings exist and work,
  not their values (Nimish, 08-Nov-2026: values are settings with defaults).
- A move between places is one row with a fixed direction per kind: no half-transfers, no deferred checks.
- Approval is voided by a digest of the lines (including unit), not an edit count: rebuilds write no edit row. The
  send code's text comparison (`materials_list._last_send`) is not reused: the text has names and no codes.
- The send check sits on `materials_send`, because an email send never changes the list's state.
- `who` is a staff uuid, matching the materials tables, not CP-6's text `changed_by`.
- Reuse C5's approval list (R10), refusing its send-back for this kind rather than half-supporting it.

## Alternatives considered (all rejected by the author)
- A stored on-hand column updated by each move: a second copy that can disagree with the records.
- A transfer as two rows sharing an id: needs a deferred check to stop a lone row creating stock.
- Void approval by counting `materials_line_edit` rows: a rebuild changes lines without one.
- Gate only the list's change from draft to sent: misses email sends and re-sends.
- Approve per line, or only lines above the threshold (reading B): see the two readings.
- Approve the monthly consolidated school list: the fortnight is the planning unit, and the educator knows their own
  class's list.
- Record list approvals only in C5's `approval` table: it cannot hold the digest of what was approved.
- One approval column on `materials_list`: overwritten; history lost.

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| `who` and `approved_by` are what the caller says, as in every materials table today | Named, not fixed: binding them to the signed-in person is CP-2/CP-3's identity work; the builder uses it if it is on main |
| CP-4's access check cannot take `stock_move` as school-wide | `athena block CP-17`, not an invented rule |
| CP-6 is not on main; D6 needs `fortnight_is_frozen` | Proofs fail loudly until it is: that is the dependency |
| A superuser or migration can disable a trigger | The rules guard every role except the database owner |
| Lock waits: one lock per item for stock, the list row for edits and sends | Short transactions; a class list is tens of lines |
| `approval_list` computes a digest per fortnight list | One aggregate over a short list; measured in the proof run |
| Nothing is tracked until people enter rupee values | Stated in the scope; CP-17 never fills them |

## Proofs (what the builder must make pass)
Database proofs run on the throwaway Postgres (`TEST_DATABASE_URL`), rolled back, with fake items, classes and staff ids.

| Done-when | Proof covers |
|---|---|
| 1 | `material_is_tracked` against the setting; changing the setting; empty value; `record_items` default all |
| 2 | D9: search, and the engine's materials route uses the rule |
| 3 | each kind, its place effects, `stock_on_hand`; update and delete refused; truncate refused for `app_engine` |
| 4 | D1 (with `record_items` = tracked) to D5, including two concurrent issues |
| 5 | D6 (including a fortnight list whose dates are not one teaching fortnight), and the `approval_list` row |
| 6 | D7 and D8: an educator edit and a rebuild void approval; send by each route and re-send refused |
| 7 | `access_table` rows; existing materials tests |
| 8 | LIVE, read-only counts: four settings per school; no negative `stock_on_hand` |

## Implementation list
- `supabase/migrations/<ts after CP-4 and CP-6>_inventory.sql`: settings rows, the functions, `stock_move`,
  `stock_on_hand`, `materials_list_approval`, the triggers on `stock_move`, `materials_line`, `materials_send` and
  `materials_list` and `approval`, the `approval_kind` row, the `approval_list` branch,
  `access_table` rows; ends with `select internal.apply_conventions()`. Idempotent. No timestamp chosen here.
- `supabase/seed/config.json`, `supabase/seed/vocabulary.json`: the four settings and the approval kind's words.
- `packages/engine/engine/api/routes/materials.py:211`, `packages/engine/engine/w2_print/materials_list.py:154`: call
  the one rule in SQL.
- `packages/engine/engine/w2_print/materials_approval.py`: the one function above (listed on its step in `workflows.json`).
- Tests: `packages/engine/tests/test_stock.py` (items 1, 3, 4), `test_materials_approval.py` (items 5, 6) and
  `test_tracked_rule.py` (item 2). One helper in `packages/engine/tests/materials_rows.py`, `approvable(conn, school,
  klass)`, makes a teaching fortnight matching the list's dates, a frozen `fortnight_cycle` row and an open
  approve-role grant; `test_materials_send.py`, `test_materials_reminders.py` and `test_cli_materials.py` use it where
  they send a fortnight list. The LIVE check (item 8) is a box-only script beside the proofs.
- `packages/engine/engine/w2_print/materials_inventory.py` (sending to the inventory person) is not touched; the name is
  close, the job is not.
- The order of building is left to the build plan (`specs/CP-17/plan.md`).
- `docs/notes/CP-17.md` at commit boundaries.
