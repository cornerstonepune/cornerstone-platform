# CP-19 design: reports line by line, consent before any send, and the coordinator's counts

Status: reviewed by four fresh reviewers (simplicity, design, codebase accuracy, readiness to build); their blockers are
applied below. Written unattended (no author gates), so mechanical choices are mine, recorded with reasons; the three
that change what a parent or the school sees are under "Decisions for Nimish". Read with `specs/CP-19/spec.md`.
Review summary: `specs/CP-19/design-review/summary.md`.

## The problem

Three things a parent or the coordinator would rely on are not true today.

1. **Approval is per report, not per line, and people are free text.** A parent report is one `parent_note` row whose
   `body` holds the facts and the model's prose (`engine/w4_close/parent_report.py`). The database already insists on two
   different people (`approval_checked`, `20261208090000_one_approval_list.sql:133-154`), but for the whole report, and it
   compares them as typed text in `approval.by`. The first approval is `parent_note.approved_by`, which any caller can
   fill. No line says which dated evidence it rests on, and nothing marks an area seen too little.
2. **Consent is recorded but never read before a send.** `consent` and `consent_now` exist (C6 migration); only a test
   reads them. The only guard on `parent_note.sent_at` is the approval state. Nothing writes `sent_at` today, so this is a
   gap before first use, not a leak.
3. **The coordinator's counts are worked out in four places.** `w3_read/k2_reads.py::coordinator` counts per week in SQL
   and returns `unplanned = None`; the reports page counts in TypeScript (`growth/reports/page.tsx`,
   `lib/queries-reports.ts`); the Today page has its own "waiting" rule (`lib/queries-today.ts`); and "out of date" means
   "the facts changed" in the engine but "a newer confirmed evidence row exists" on the website. Two screens can show
   different numbers for one fortnight.

## Goals

- Every line a parent would read is stored on its own, cites the confirmed, dated evidence rows it rests on, and is
  marked thin when it rests on fewer than the existing "seen enough" setting.
- Each line needs two approvals by two different staff members, whose identity the database takes from the signed-in
  website session, and each by a person whose role allows that step. The engine cannot approve or send.
- A report can be marked sent only through one database function, which refuses unless every line is approved twice,
  the report is the newest and not out of date, and consent is on record; every refusal is recorded.
- The coordinator's counts, per fortnight, per class and per educator, come from one database function that the engine
  and the website both read. Per-educator figures are counts of notes, never a score, rate or rank.

## Non-goals

- Any screen. The frontend revamp builds the line-approval view and the coordinator's page on these functions.
- Delivering a real message to a parent (WhatsApp or email). CP-19 builds the gate and the record a delivery must pass
  through; no real parent message is sent in this scope.
- Recording consent through a screen; the lawyer's review of the register text (C6 follow-ups).
- Changing how the child picture is built (CP-9) or who may read which table (CP-3, CP-4).

## Dependencies, named

- **CP-4** (locked, #452): every new base table needs an `access_table` row as `child_data` or `school_wide`, and
  `apply_conventions()` raises on an unlisted table. CP-19 adds two base tables, both child data keyed by `child_id`:
  `report_line` and `report_send`; the migration inserts both rows before `apply_conventions()`. Because that insert
  needs CP-4's table, **the build waits for CP-4 to merge**; the proofs are written now and fail until then, as CP-9's
  `access_table` proof does.
- **CP-9** (PR #478, built, not merged): confirmed observations become `evidence_event` rows, and
  `public.unplanned_sessions()` counts sessions with no plan line. CP-19 cites those rows and reads that function for
  "unplanned". **The build waits for CP-9 to merge** and reads the function's signature from main then.
- **CP-2** (merged): `public.current_staff()` reads `app.staff_id`, which the website sets from the verified sign-in
  cookie inside its own transaction (`apps/web/lib/db.ts`). It does not travel over HTTP to the engine, and any role can
  set it. CP-19 therefore trusts it **only inside functions that `app_web` alone may execute** (decision 3 below).
- **CP-6** (locked, not built): CP-19 uses only the `fortnight` table (on main) for dates, not CP-6's states.

## Technical plan

```
engine (app_engine)                          website (app_web, staff id set from the sign-in)
facts() ─code─▶ new parent_note + report_line rows   report_line_decide(line, approved|sent_back, reason)
         (section, skill, evidence ids)                    └─ step 1: class educator; step 2: coordinator; different staff
model ──▶ one sentence per line, checked              report_mark_sent(note, channel)
                                                           └─ refuses and records unless every rule holds
coordinator_counts(fortnight) ◀── engine `engine report counts`, k2_reads, reports page, Today page
```

### 1. The report and its lines

- **A report** stays a `parent_note` row. New nullable columns `period_from date`, `period_to date`; old rows keep `week`
  and have none. A rebuild of a child's report for a period makes a **new** `parent_note` with its own lines (today's
  pattern: the newest note is "the report"); approvals never carry over. "Newest" = the latest `created_at` for the child
  and period.
- **A line** is a `report_line` row: `id, tenant_id, child_id, parent_note_id, section, skill_id, text, evidence_ids
  uuid[], supersedes uuid unique null, created_at, created_by`. Insert-only: update and delete are refused by trigger.
  An educator's wording fix is a new row with `supersedes` = the old line; a line is **live** when no row supersedes it.
  The new line needs its own two approvals.
- **Built by code from `facts()`**: one line per entry in the sections a parent reads (`can_do`, `nearly`, `improving`,
  `working_on`, `next`). `parent_facts.py` today selects answer ids, not evidence ids (`parent_facts.py:19-27`); the
  build maps each fact to the `evidence_event` rows behind it (for a maths answer, the evidence row recorded from that
  answer; for K2, the observation's evidence row from CP-9). `next` is a suggestion, not a claim: it cites no evidence and
  is never thin. Every other section must cite at least one row.
- **Checked by the database on insert**: every cited row is this child's, confirmed (`confirmed_by is not null`), and
  dated on or before `period_to`; otherwise the insert is refused. A line cannot be added to a sent note.
- **Thin**, computed on read in the view `report_line_now`, never stored: `section <> 'next'` and the number of distinct
  cited evidence rows is below `threshold('state.min_events')` (3 today, the picture's own "not enough yet" setting, so
  one rule decides "seen enough" everywhere). Changing the setting changes thin at once.
- **Text**: a new version of the `parent_report` prompt returns one sentence per line (`[{line_id, text}]`). The existing
  `parent_check` holds each sentence to its own line's facts and `parent_review` reads it, as today. Per rule 7 the
  version is active only after `engine eval parent_report` records a score at or above its bar in `DECISIONS-LOG.md`.

### 2. Two approvals per line (the existing approval list, extended)

- `approval` gets `step smallint null` and `staff_id uuid null` (old rows keep both null), with a check that a
  `report_line` approval has both. `target` holds the line id as text (as it holds a note id today); `by` is filled with
  the staff id as text so the existing not-null holds. New `approval_kind` row `report_line` (`reaches_parent = true`),
  also added to `internal.approval_begins()` for new schools.
- **Only through `report_line_decide(p_line uuid, p_decision text, p_reason text)`**, `security definer`, executable by
  `app_web` only. Insert on `approval` is revoked from `app_web` and `app_engine` (no app code inserts approvals today).
  In one transaction it locks the line's note (`for update`), then:
  - takes the person from `current_staff()` (null → refused), never from a parameter;
  - refuses if the note is sent, the line is not live, or the line was sent back;
  - **step 1** (no approval yet): the person must hold an open `staff_role_grant` on the child's class with a role in
    `config('report.first_approver_roles')` (default `["class_teacher", "cover_educator"]`);
  - **step 2**: the person must hold a role in `config('k2.reads.coordinator_roles')` (the coordinator, the same list the
    coordinator's page uses today) and must not be the step 1 person;
  - a missing or empty roles row refuses (fails closed);
  - `sent_back` needs a reason and is final for that line: the fix is a new line.
- Unique indexes on `(target, step)` and `(target, staff_id)` for `kind = 'report_line'` stop two concurrent approvals.
- `approval_list` gets a `report_line` branch (first = step 1 row, second = step 2 row), so there is still one list of
  what is waiting. State precedence: any `sent_back` → `sent_back`; else two approvals → `approved`; one →
  `waiting_second`; none → `draft`.

### 3. Consent before any send

- `report_send` (`id, tenant_id, child_id, parent_note_id, outcome in ('sent','refused'), reason, channel, staff_id null,
  at`): insert-only.
- **Only through `report_mark_sent(p_note uuid, p_channel text)`**, `security definer`, executable by `app_web` only. It
  locks the note and checks, in this order, recording the first failure as a `refused` row and returning it (not raising,
  so the record stays):
  `no_staff` (null `current_staff()`), `not_allowed` (the person holds no role in `k2.reads.coordinator_roles`),
  `already_sent`, `not_newest`, `old_report` (no period: made before CP-19), `no_lines`, `not_all_approved` (a live line
  is not `approved`), `out_of_date`, `no_consent` (`consent_now` for the child is not `given`, or `register_unchanged` is
  false), `bad_channel` (not `whatsapp` or `email`, the values the materials send already allows). Otherwise it sets
  `sent_at`, `channel` and records `sent`.
- **No other path**: the existing `parent_note_sent_when_approved_twice` trigger is replaced by one that refuses any
  change to `sent_at` or `channel` unless `current_user` is the functions' owner (the migration owner). `app_web` and
  `app_engine` cannot become that role.
- Consent withdrawn after a send recalls nothing; it stops the next send. "Sent" means released for delivery and
  recorded; the delivery is a later scope.

### 4. One definition of "out of date"

`report_out_of_date(p_note uuid) returns boolean`, SQL: true when a confirmed `evidence_event` for the note's child,
dated on or before `period_to`, was created after the note. This is the website's rule today, moved into the database;
the engine's own facts comparison and the website's TypeScript rule are removed, and both read this function. It does
not notice a changed setting; a report built before a settings change is rebuilt by the next fortnight's run.

### 5. The coordinator's counts

`coordinator_counts(p_fortnight uuid) returns table (scope text, school_class_id uuid, staff_id uuid, measure text, n
int)`, one SQL statement, `security invoker`, so CP-3/CP-4 rules decide which classes a caller sees. The period is the
fortnight (Nimish, 8 Nov: the fortnight is the planning unit); the coordinator's counts today are per week and move to
the fortnight. A note counts for the class it was recorded in, not the child's class today. Measures:

- per class: `notes_confirmed`, `notes_late` (confirmed on a later day than observed, today's rule), `children_without_notes`,
  `class_days_without_notes` (today's `k2_reads` definitions, moved unchanged), `unplanned` (CP-9's function over the
  fortnight's dates), `lines_draft`, `lines_waiting_second`, `lines_approved`, `lines_sent_back`, `reports_out_of_date`,
  `reports_sent`, `sends_refused`;
- per educator, the educator who recorded the note: `notes_confirmed`, `notes_late` only. These rows are returned only to
  a caller in `k2.reads.coordinator_roles`, and to an educator for their own row (decision for Nimish 3).

Every `n` is a whole-number count. There is no score, percentage, rate or rank column and no `order by` on a count.
`k2_reads.coordinator` reads its counts from this function (its rows stay in Python: their state comes from
`voice_intake.resolve`), and `unplanned = None` goes. The reports and Today pages read the function and the line view;
their TypeScript counting and "waiting" rules are removed. `engine report counts --fortnight N` prints the counts with
class and staff ids only, no names.

## Mechanical decisions (recorded, with reasons)

1. **Extend `approval` and `approval_list`; no second approval table.** One list of what is waiting already exists.
2. **Lines built by code, sentences by the model.** Which evidence supports a line, how much, and whether it is thin are
   lookups and counts; a number is never a model's last word.
3. **Approve and send only in `app_web`-only functions.** `current_staff()` can be set by any role, so it is trusted only
   where the caller must be the website, which sets it from the verified sign-in. The engine's routes for approving a
   whole report are retired for new reports; the website calls the functions over its own connection.
4. **A refusal is a returned, committed row.** An exception would roll the record back.
5. **Thin reuses `state.min_events`.** One "seen enough" rule for the picture and the report; no new setting.
6. **Consent needs `register_unchanged`.** If the school changed what it keeps after the parent agreed, ask again.
7. **A rebuild is a new note.** It keeps today's "newest note is the report" rule and needs no line-retiring path.
8. **New settings rows**, seeded in `supabase/seed/config.json`: `report.first_approver_roles`
   (`["class_teacher","cover_educator"]`) and `report.period_fortnights` (2: the agreed workflow's "monthly", N12, in the
   school's fortnight unit; teaching fortnights only).
9. **Build in three phases**: schema and its tests; engine; website.

## Decisions for Nimish

1. **Who gives the two approvals.** Recommend: the child's class educator first, then the coordinator, never the same
   person. This is what the agreed workflow says ("coordinator approves") and the blueprint ("educator line by line,
   coordinator releases"). Any-two-staff is faster but lets a report reach a parent without the coordinator seeing it.
2. **What a parent sees for a thin area.** Recommend: keep the line and say plainly that the educator has not yet seen
   enough to say. Hiding it makes a thin report look complete.
3. **Who sees per-educator counts.** Recommend: the coordinator sees every educator's counts; each educator sees only
   their own. Side by side, two counts give a lateness rate that a list can be sorted by; that is a score in all but name.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| The engine or a script poses as a staff member | Approve and send only in functions `app_web` alone may run; insert on `approval` and writes to `sent_at` refused for the app roles |
| One person approves twice, or two approvals race | Step-2 rule compares staff ids; unique indexes on (line, step) and (line, staff) |
| A report with no lines, an old report, or a stale one is sent | `no_lines`, `old_report`, `not_newest`, `out_of_date` refusals |
| Counts differ between screens | One function; the TypeScript and Python counting removed; a proof compares every measure to a direct count |
| The roles row is deleted | The functions refuse when a roles row is missing or empty |
| A refusal is lost | It is a committed row returned to the caller |

## Alternatives considered

- **Approve the whole report twice (today).** Rejected: M1-07 asks for each line, and one wrong sentence passes when
  approvers skim a whole letter.
- **Check consent in the engine.** Rejected: any other caller skips it; the database is the one place every path passes.
- **Split the model's letter into sentences after writing.** Rejected: a sentence then has no evidence to cite.
- **A transaction flag that only the send function sets.** Rejected in review: any role can set a flag; the owner-only
  check cannot be forged.
- **No refusal record (the trigger simply raises).** Rejected: the earlier draft of this scope asked for the refusal to
  be recorded, and it costs one insert-only table.

## Detailed implementation

Phase 1, schema (one migration; timestamp chosen at build, after CP-4's and CP-9's):
- `supabase/migrations/<ts>_report_lines_and_send.sql`: `report_line`, `report_send`, the new columns on `parent_note`
  and `approval`, the `approval_kind` row and `internal.approval_begins()` update, the `approval_list` branch, the
  replaced `sent_at` trigger, insert-only triggers, `report_line_now`, `report_line_decide`, `report_mark_sent`,
  `report_out_of_date`, `coordinator_counts`, unique indexes, the two `access_table` rows, grants and revokes.
- `supabase/seed/config.json`: the two settings rows. `packages/engine/engine/checks/rules.json`: regenerated
  (`engine live rules --write`).
- `packages/engine/tests/test_report_lines.py`, `test_report_send.py`, `test_coordinator_counts.py`: database tests that
  set `app.staff_id` with `set_config(..., true)` inside a transaction as `app_web`.

Phase 2, engine:
- `packages/engine/engine/w4_close/report_lines.py` (new, under 400 lines): build a note's lines from facts; write the
  sentences; read `report_line_now`.
- `packages/engine/engine/w4_close/parent_facts.py`: return the evidence ids behind each fact.
- `packages/engine/engine/w4_close/parent_report.py`, `every_report.py`: build notes with a period and lines; `latest`
  reads `report_out_of_date`; `approve` retired for new notes.
- `supabase/seed/prompts.json`, `supabase/seed/prompts/parent_report.v13.txt`, the eval gold set: the one-sentence-per-line
  version, inactive until its score is recorded in `DECISIONS-LOG.md`.
- `packages/engine/engine/w3_read/k2_reads.py`: counts from `coordinator_counts`.
- `packages/engine/engine/w4_close/cli_report.py`: `engine report counts --fortnight N`.
- `packages/engine/engine/api/routes/parent.py`: the whole-report approve route refuses new notes.
- `workflows.json`: N12's files and commands. `packages/engine/tests/test_parent_report.py`, `test_k2_reads.py`: updated.
- n8n workflows f1 to f4: no change.

Phase 3, website:
- `apps/web/lib/queries-reports.ts`, `apps/web/lib/queries-today.ts`, `apps/web/app/(app)/growth/reports/page.tsx`: read
  `coordinator_counts`, `report_line_now` and `report_out_of_date`; remove the TypeScript counting and rules. No new
  screen; existing pages and speed tests stay green.
- `docs/notes/CP-19.md`: the branch note.
