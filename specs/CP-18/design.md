# CP-18 design: materials, the reading prompt on, sends recorded, reminders delivered

Status: draft for Nimish. Reviewed by three fresh reviewers (simplicity, design, codebase accuracy); every blocker and
"should" is applied below or answered in `specs/CP-18/design-review/summary.md`. Written unattended, so mechanical choices
are mine, recorded with reasons; Nimish's one choice (how reminders reach people) is decided: see "Decided". Read with
`specs/CP-18/spec.md`. Plan row: `docs/backend-plan.md` CP-18 (roadmap M1-10, M1-16).

## Problem (true on main, 8 Nov)
- **The reading prompt is off and unscored.** `materials_read` v1 and v2 are seeded `"active": false`
  (`supabase/seed/prompts.json:3565, 3621`). The gold set is empty (`supabase/seed/materials_read_gold.json`), so
  `engine eval materials_read` refuses before any model call (`materials_read_eval.py:32`). Its three bars are rows marked
  "PROPOSED" (`thresholds.json`: `confirmed_wrong_at_most` 0, `found` 0.80, `held_back_right` 0.95). No line in
  `DECISIONS-LOG.md` scores it. A typed or photographed materials note cannot be read.
- **A send can go to nobody and still count as sent, and no record says to whom.** `materials_send` and
  `materials_consolidated_send` are append-only (text, status, who tapped, when). Neither records a recipient. With the
  number settings empty (`materials.whatsapp_to`, `materials.inventory_whatsapp_to`, both `""`) the send is still stored
  as `opened`, the list set to `sent`, its reminders cancelled (`materials_send.py:60-76`); the consolidated send is always
  `opened` (`materials_inventory.py:64`). Nothing checks approval (that arrives with CP-17).
- **Reminders reach no one.** `reminder` rows exist (two weeks and one week before the first day a material is needed,
  `materials.reminder_weeks` [2, 1], audience educator or team). `engine reminders --due` only counts them. The engine
  has no sender; the website has one (`apps/web/lib/mail.ts`, plain SMTP, used for sign-in mail).

## Goal
1. `materials_read` is scored on real notes against its bars, the score is on record, and the scored version is on.
2. Every send records who sent what, to which staff member, and when; it goes only when approved (CP-17) and only to a
   named recipient; with none named, nothing goes and that is recorded.
3. Every due reminder is delivered to each of its people, or the reason it was not is recorded, once per person.
4. No phone number, email address or name in a log, a send row or a delivery row.

## Non-goals
Stock, issues, the rupee threshold, the approval itself (CP-17). Any screen. Parent messages (CP-19). The email route of
a class-list send (it stays `not configured`, as today). A reminder kind the roadmap does not have. Switching on any other
prompt. Enforcing rule 7 in code for all prompts.

## Dependencies (named; none of them is on main yet)
- **CP-17 (waits for).** No `specs/CP-17` on any branch when written; issue #465 is a draft that still says "the month's
  list". **Assumption, stated in the issue:** CP-17 records an educator's approval of her class's list (who, when) and
  offers one check, "is this list approved as it reads now". CP-17's approval does **not** change `materials_list.state`
  (both reminder queries filter `state = 'draft'`, `materials_remind.py:84, 101`); if it does, those queries are widened
  in this build. CP-18 calls that check and never re-implements it. CP-18 follows CP-17's unit (fortnight, per Nimish's
  rule of 8 Nov, or month if CP-17 keeps it).
- **CP-6.** Scoped on the orchestrator's branch (issue #454, not on main). Its fortnight state ends in `list_sent`,
  which its design says CP-17/CP-18 set. CP-18 sets it through CP-6's own step function, and only when the consolidated
  list covers exactly one fortnight. If that function sits outside `engine/w2_print`, the build adds the hand-over to
  `workflows.json` (`test_layout.py` checks hand-overs).
- **CP-4's table list.** CP-4 (issue #452, locked, not merged) adds `access_table` and makes `apply_conventions()` raise
  on an unlisted base table. CP-18 adds one base table, `reminder_delivery` (staff ids only, no child): the migration adds
  its `access_table` row as `school_wide` with a one-line reason, so **the migration cannot be applied before CP-4
  merges**. The build regenerates `engine/checks/rules.json`. Proofs run on the throwaway database (CP-20).

## Technical plan

### 1. The reading prompt: scored, then on
- **Gold set from real notes** (D-028). People give real requests for one fortnight from two or more classes, at least
  one a photographed handwritten staff note with no child in it, and a person marks each line's item, quantity and unit
  (about 100 lines, M1-16's estimate). Typed notes enter `materials_read_gold.json` with any name removed by the person
  preparing them. **Photographs never enter git** (rule 6): they live on the box under `data/` (gitignored); the gold
  file names each by a file key.
- **Photo cases are scored as the engine treats them.** A photograph alone never confirms a number
  (`materials_intake.py:162`), so a photo case counts only toward `held_back_right` and the "a person is visible" answer,
  not toward `found`. The eval is changed to load the image by key and pass it to `ask_model` (which already takes
  `image`, `materials_intake.py:124-136`).
- **Bars stay rows with defaults** (Nimish's rule). The three rows lose "PROPOSED". One floor is added the way bars
  already work: `score()` reports `lines` (the marked lines it scored) and the row `eval.materials_read.lines` is 60, so
  `bars.short` refuses a score on too few lines (`checks/bars.py`); no refusal code is written.
- **Score on the box** with `engine eval materials_read` on v2 (v1 cannot fire a unit conversion). One line in
  `DECISIONS-LOG.md` in the form of `english_generate` v2's line of 27 Oct (date, version, run id, each measure against
  its bar, lines), plus the spend from the run's `flow_run` rows.
- **On:** v2 gets `"active": true` in `prompts.json`; v1 stays off. If v2 misses a bar it stays off, a v3 is made and
  scored (rule 7), and CP-18 is not done.
- **Cost, approximate and unverified:** about 200 note-sized calls, about ₹127 (≈ $1.44), M1-16's estimate (its token
  counts are assumptions). It runs inside the `m1-16` campaign's monthly cap ($2), in a month with room.

### 2. Sends: approved, addressed, recorded
- **One recipient each, named as staff.** `materials.team_staff` (who receives a class list) and
  `materials.inventory_staff` (who receives the consolidated list): one staff id each, default empty. They replace the two
  number settings. Reason: a number in `config` is staff personal data outside `pii`, and a WhatsApp link reaches one
  number.
- **The number is read through the existing door.** `app_engine` cannot read `pii.staff`; it calls
  `pii.read_staff(staff_id, actor)`, which writes `access_log` on every read. One helper beside `held_classes` in
  `materials_list.py`, `contact(conn, staff_id, actor)`, is the only place CP-18 reads a phone or email; the send code and
  the reminder code both use it.
- **`to_staff uuid` (nullable) added** to `materials_send` and `materials_consolidated_send`. Both stay append-only. Old
  rows keep null.
- **Order inside a send** (one transaction): lock the list row (`_compose(..., lock=True)`, as today), then call CP-17's
  check on the same connection, then build the text. Line edits (`materials_list.add`, `set_quantity`, `remove`) take the
  same row lock, so the text sent is the text approved. A consolidated send is refused unless every class list in it
  passes the check; the refusal names the classes that fail.
- **Outcomes:** not approved → refused, nothing recorded, HTTP 409 from the routes (`materials.py`,
  `materials_school.py`, which today map only `NothingToSend`). No recipient, or a recipient with no phone → a row with
  status `not configured`, `to_staff` as set, the list stays a draft, reminders stay pending. Otherwise the link opens
  WhatsApp to that number; the row records `opened`, text, who tapped, `to_staff`, when. The engine sends nothing on this
  route; delivery cannot be known (D-071). An edit after a send does not reopen the list (today's behaviour, unchanged).
- **The fortnight's step:** a consolidated send recorded `opened` for exactly one fortnight sets CP-6's `list_sent`,
  with the send's who and when.

### 3. Reminders: delivered and recorded
- **Sender (ring C): `packages/engine/engine/adapters/notify.py`.** `send(address, subject, text) -> (status,
  provider_ref)`, nothing more. It repeats the website's contract (`apps/web/lib/mail.ts`): the same five variables
  (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`), Python's `smtplib`, the same words `sent`,
  `not configured` (any variable missing; no network call), `failed`; it never logs the address or the text. When WhatsApp
  is set up later (Nimish's decision), it is a second sender in the same file.
- **The rules live in `materials_remind.deliver_due(conn, today, tenant, actor)`**, so the tests exercise them with a
  fake `notify.send`:
  - **Run lock:** `pg_try_advisory_lock` on the tenant; if held, the run exits with counts 0. Two runs never overlap.
  - **Owed:** a reminder is owed to a person when it is `pending`, `due_on <= today`, `today <=` the list's first needed
    day (so old draft lists are not swept up on the first run, and a failure is not retried past the day), and that
    person has no `delivered` row for it.
  - **Per person, one message per run** listing all their owed lists (fixed sentences in code with the class, the
    fortnight, the first day needed and what to do: "approve your list" before approval, "send your list" after). No
    prompt, no model, no child named.
  - **Per list, before sending:** lock the list row `for update` where `state = 'draft'` (the lock `send` takes) and
    re-read its pending reminders; a list sent meanwhile drops out. Commit after each message.
  - **People:** audience `educator` → the staff who hold the class: a new query `materials_list.holders(conn, class_id,
    today)` using the same `educator.timetable_roles` setting and validity window as `held_classes`; audience `team` →
    `materials.team_staff`.
- **Table `reminder_delivery`** (append-only by `forbid_change`): `id, tenant_id, reminder_id, to_staff, status in
  ('delivered','failed','not configured','no contact'), provider_ref, at`. `delivered` means the mail server accepted it,
  not that it was read. Partial unique index `(reminder_id, to_staff) where status = 'delivered'`; second partial unique
  index `(reminder_id, to_staff, status) where status in ('not configured','no contact')`; inserts use `on conflict do
  nothing`. So a person is never sent a reminder twice through the database, a `not configured` or `no contact` row is
  written once, and the reminder is still owed and goes out once the sending account or the address appears. `failed` is
  retried next run while the reminder is owed. **At-least-once, plainly:** a crash between the mail server's accept and
  the commit can repeat one message the next night.
- **Command:** `engine reminders --deliver` prints the owed count before and the counts by status after, per fortnight;
  never an address or a name. The box timer line (`docs/notes/m1-10-materials-list.md:15`) changes from `--due` to
  `--deliver` at deploy. `--due` stays.
- **Grants:** default privileges give the table to `app_engine`; `apply_conventions` removes update and delete; the
  migration revokes `select` from `app_web` (the site does not read it).

### 4. Consent
- **Email (decided channel):** messages go to the work address each staff member signs in with, about their work. No
  separate yes is collected; anyone can be taken off by clearing them from the setting or the class.
- **WhatsApp business number (if chosen):** each person's recorded yes is required before the first message (Meta's
  rule), and a consent record is built with that option; it is not built now.
- No child data is in any list, send or reminder; the parents' `consent` (C6) is not involved.
- **No proof sends anything.** Tests use a fake sender and no SMTP variables. Non-box tests fail if SMTP variables are
  present in their environment. Box proofs only count rows.

### 5. Logs
No `print`, log call or exception message in new or changed code carries a phone number, an email address or a name;
errors carry staff ids and statuses. A test runs a delivery and a send with log capture and scans the text against the
fake staff's contact details and names.

## Box-only proofs (`check_box`, read-only, counts only, after deploy)
(a) the live active `materials_read` version is the one scored in `DECISIONS-LOG.md`; (b) per fortnight: sends with a
recipient; (c) per fortnight: reminders delivered, reminders owed with no delivery row of any status (must be 0), and
`failed` rows. (b) and (c) need real use, so CP-18 finishes in production only after one real fortnight.

## Mechanical decisions (with reasons)
1. No new prompt-activation code: rule 7 by eval, log line and seed change, as `english_generate`.
2. One new table (`reminder_delivery`), not a generic message table: a send is a person's tap; a reminder is the engine's.
3. Recipients as one staff id each: keeps numbers in `pii`, makes "to whom" true for a one-number link.
4. Reminder sentences in code, not a prompt: nothing to judge.
5. The line floor as a bar row: reuses `bars`, no refusal code.
6. No retries inside a run: a reminder has weeks of lead time; the next night retries.
7. No consent table now: email to work addresses about work; WhatsApp would bring one.
8. Rules in `materials_remind`, adapter only sends: the rules run in tests; ring C stays "where an outside service is named".

## Decided (Nimish, 8 Nov)
**Reminders go by email now; WhatsApp is a later addition.** His words, relayed by the orchestrator: "reminders go by
email till the time we set up WhatsApp, and then maybe WhatsApp is used as a better mechanism." So the sender sits behind
the one adapter file: adding WhatsApp later is a new sender there plus each person's recorded yes, not a change to this
scope. Options weighed before he decided: email (chosen), a WhatsApp business number (Meta's verification, approved
wordings, a charge per message, each person's yes), and site-only (reaches nobody who does not open it).

## Detailed implementation (files)
- `supabase/migrations/<timestamp chosen at build>_materials_sends_and_reminders_reach_people.sql`: `to_staff` on both
  send tables; `reminder_delivery` with `forbid_change`, both partial unique indexes, `revoke select … from app_web`, its
  `access_table` row; `select internal.apply_conventions();`. Additive, runs twice. Applied only after CP-4.
- `supabase/seed/config.json`: `materials.team_staff`, `materials.inventory_staff` (empty); the two number settings
  removed (checked empty on the box first, count only).
- `supabase/seed/thresholds.json`: the three descriptions; `eval.materials_read.lines` 60.
- `supabase/seed/materials_read_gold.json`: real typed cases and photo keys from people.
- `supabase/seed/prompts.json`: `materials_read` v2 `"active": true`, only after a passing score.
- `packages/engine/engine/w2_print/materials_read_eval.py`: `lines` in the score; photo cases load the image by key.
- `packages/engine/engine/adapters/notify.py` (new).
- `packages/engine/engine/w2_print/materials_list.py`: `contact`, `holders`; line edits take the list lock.
- `packages/engine/engine/w2_print/materials_send.py`, `materials_inventory.py` (and its docstring): approval, recipient,
  `not configured`, `to_staff`, CP-6 step.
- `packages/engine/engine/w2_print/materials_remind.py`: `deliver_due`.
- `packages/engine/engine/w2_print/cli_materials.py`: `--deliver` (check its ceiling in `workflows.json`).
- `packages/engine/engine/api/routes/materials.py`, `materials_school.py`: 409 for "not approved".
- `workflows.json`: the sender in the `does` sentence of the shared `adapters` entry (not in N4's files:
  `test_layout.py` refuses a shared file named by a step); `engine reminders --deliver` in N4's commands; a CP-6
  hand-over if needed. `apps/web/lib/engine-routes.ts` needs no change (request bodies unchanged).
- `packages/engine/engine/checks/rules.json`: regenerated.
- Tests changed: `packages/engine/tests/test_materials_send.py`, `test_materials_inventory.py`,
  `test_materials_list.py`, `tests/api/test_materials_routes.py`, `tests/api/test_materials_school_routes.py` (they name
  the number settings or expect a send with no recipient). New: `test_reminder_delivery.py`, `test_notify.py`.
- Docs: `DECISIONS-LOG.md` (score line); `docs/notes/CP-18.md` (branch note: timer change, people's steps); the
  setting names in `docs/notes/m1-10-materials-list.md`, `docs/notes/m1-16-materials-consolidated.md` and
  `goals/m1-10-materials-list.yaml` (read-only history: a one-line pointer to CP-18, not a rewrite). A short capability
  record in `docs/decisions/` (`Capability: staff-reminders`) on the channel.
- Not touched: any screen, `STATE.md`, `HANDOFF.md`, the parents' `consent`.

## Alternatives considered
- **Numbers in settings rows.** Rejected by author: staff personal data outside `pii`; "to whom" would copy a number.
- **Several recipients per send.** Rejected by author: a WhatsApp link opens to one number; the record would claim people
  it never reached.
- **"Delivered" = shown in the site inbox.** Rejected by author: the scope says reminders reach people. Kept as (c).
- **A model writes the reminder.** Rejected by author: fixed facts, no judgment.
- **A consent table now.** Rejected by author for email (work address, work message); comes with WhatsApp if chosen.
- **The engine sends the class list itself.** Rejected by author: the educator taps today and the school sees it as her
  message; changing that is a screen and policy change.

## Needs from people (not decisions; nothing invented)
Real notes for one fortnight, one photographed; a person to mark about 100 lines. Which staff member receives class lists
and which the consolidated list. The school mail account's SMTP details as box secrets, never in git.

## Risks not verified
- No live data seen: whether the materials migrations are on live, whether send rows exist, whether the named staff have
  `phone` / `email` in `pii.staff`.
- CP-17's check, unit and whether approval changes the list's state are assumed.
- Whether staff read email (the reason WhatsApp may follow).
- The model's "a person is visible" answer on photographs is unverified until the gold set has such a case.
- Per-fortnight counts assume the list's dates fall inside one `fortnight` row; a monthly list is counted under the
  fortnight of its first day.
