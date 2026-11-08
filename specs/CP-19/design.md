# CP-19 design: reports line by line, consent before any send, and the coordinator's counts

Status: reviewed by four fresh reviewers (simplicity, design, codebase accuracy, readiness to build); their blockers are
applied (`specs/CP-19/design-review/summary.md`). Then simplified on Nimish's instruction (8 Nov): "keep it as simple as
you can". Kept: the two safety rules the plan names (two approvals per line, consent before any send) and counts that
match the database. Everything else moved to Out of scope. Read with `specs/CP-19/spec.md`.

## Decided by Nimish (8 Nov, through the orchestrator)

1. Each line is approved first by an educator of the child's class, then by the coordinator, never the same person.
2. A thin area stays in the report and says plainly that the educator has not yet seen enough to say.
3. The coordinator sees every educator's counts; an educator sees only their own.

## The problem

1. **Approval is per report, and people are free text.** A parent report is one `parent_note` row
   (`engine/w4_close/parent_report.py`). The database insists on two different people
   (`approval_checked`, `20261208090000_one_approval_list.sql:133-154`), but for the whole report, comparing typed names
   in `approval.by`. No line says which dated evidence it rests on or that it is thin.
2. **Consent is recorded but never read before a send.** `consent_now` exists (C6 migration); only a test reads it.
   Nothing writes `sent_at` today, so this is a gap before first use, not a leak.
3. **The coordinator's counts are worked out in several places**: `w3_read/k2_reads.py::coordinator` (per week,
   `unplanned = None`) and the reports page in TypeScript (`growth/reports/page.tsx`, `lib/queries-reports.ts`).

## Dependencies, named

- **CP-4** (locked, #452): the one new base table, `report_line`, is child data keyed by `child_id`; the migration
  inserts its `access_table` row before `apply_conventions()`. That insert needs CP-4's table, so **the build waits for
  CP-4 to merge**; the proofs are written now and fail until then.
- **CP-9** (PR #478, not merged): confirmed observations become `evidence_event` rows, and `unplanned_sessions()`
  counts sessions with no plan line. **The build waits for CP-9 to merge.**
- **CP-2** (merged): `current_staff()` reads `app.staff_id`, set by the website from the verified sign-in. Any role can
  set it, so it is trusted only inside functions that `app_web` alone may run.

## Technical plan

### 1. Lines (one new table)

- `report_line (id, tenant_id, child_id, parent_note_id, section, skill_id, text, evidence_ids uuid[], created_at)`,
  insert-only (update and delete refused). `parent_note` gets `period_from`, `period_to` (null on old notes).
- Built by code from `facts()`: one line per entry in `can_do`, `nearly`, `improving`, `working_on`, `next`. Each line
  cites the `evidence_event` rows behind it (`parent_facts.py` today selects answer ids; the build maps them to their
  evidence rows; K2 lines cite CP-9's observation evidence). `next` is a suggestion: it cites none and is never thin.
- On insert the database refuses a cited row that is not this child's, not confirmed (`confirmed_by is null`), or dated
  after `period_to`, and refuses lines on a sent note.
- **Thin** is computed on read in view `report_line_now`: not `next`, and fewer distinct cited rows than
  `threshold('state.min_events')` (the picture's existing "not enough yet" setting; one rule everywhere).
- The sentence for each line comes from a new version of the `parent_report` prompt (one sentence per line, checked by
  the existing `parent_check` and `parent_review`), active only after its eval score is recorded (house rule 7).
- **Changing a line means rebuilding the report**: a new `parent_note` with new lines (today's "newest note is the
  report"). Approvals never carry over. No in-place rewording.

### 2. Two approvals per line

- `approval` gets `step smallint null`, `staff_id uuid null` (old rows keep null; a check requires both for
  `kind = 'report_line'`). `target` = the line id as text; `by` = the staff id as text. New `approval_kind` row
  `report_line`, also in `internal.approval_begins()`. `approval_list` gets a `report_line` branch, so there is one list
  of what is waiting. Line state: `sent_back` if any sent back, else `approved` (two), `waiting_second` (one), `draft`.
- Only through `report_line_decide(p_line uuid, p_decision text, p_reason text)`, `security definer`, executable by
  `app_web` only; insert on `approval` revoked from `app_web` and `app_engine`. It locks the note, takes the person from
  `current_staff()` (null: refused), and refuses on a sent note or a sent-back line. Step 1: the person holds an open
  `staff_role_grant` on the child's class in a role listed in `config('report.first_approver_roles')`. Step 2: a role in
  `config('k2.reads.coordinator_roles')`, and not the step 1 person. A missing or empty roles row refuses. `sent_back`
  needs a reason; the fix is a rebuilt report.
- Unique indexes on `(target, step)` and `(target, staff_id)` for `report_line` stop two concurrent approvals.

### 3. Consent before any send

- Only through `report_mark_sent(p_note uuid, p_channel text)`, `security definer`, executable by `app_web` only. It
  locks the note and raises (nothing is written) unless: a person is signed in and holds a coordinator role; the note is
  not already sent; it has at least one line; every line is `approved`; `consent_now` for the child says `given` and
  `register_unchanged`; the channel is `whatsapp` or `email`. Then it sets `sent_at` and `channel`.
- The existing `parent_note_sent_when_approved_twice` trigger is replaced by one that refuses any change to `sent_at`
  or `channel` unless `current_user` is the functions' owner; the app roles cannot become it.
- "Sent" means released and recorded; delivery is out of scope. Consent withdrawn later stops the next send.

### 4. The coordinator's counts

`coordinator_counts(p_fortnight uuid) returns table (school_class_id uuid, staff_id uuid, measure text, n int)`, one SQL
statement, `security invoker` (CP-3/CP-4 decide which classes a caller sees). The period is the fortnight (the school's
planning unit); today's per-week counts move to it. A note counts for the class it was recorded in.

- Per class (`staff_id` null): `notes_confirmed`, `notes_late`, `children_without_notes`, `class_days_without_notes`
  (today's `k2_reads` definitions, moved unchanged), `unplanned` (CP-9's function), `lines_draft`,
  `lines_waiting_second`, `lines_approved`, `reports_sent`.
- Per educator (the educator who recorded the note): `notes_confirmed`, `notes_late`; returned to a caller in
  `k2.reads.coordinator_roles` for everyone, and to an educator for their own row only.

Every `n` is a whole number; no score, rate, percentage or rank column, and no ordering by a count.
`k2_reads.coordinator` and the reports page read their counts from this function and stop counting themselves.

## Mechanical decisions

1. Extend `approval` and `approval_list`; no second approval table.
2. Lines and thin by code; the sentence by the model.
3. Approve and send only in `app_web`-only functions, because `current_staff()` can be set by any role.
4. A refused send raises and writes nothing (simplest; a record of refusals is out of scope).
5. Thin reuses `state.min_events`; no new threshold.
6. Consent also needs `register_unchanged`: a changed register means asking the parent again.
7. Settings rows in `supabase/seed/config.json`: `report.first_approver_roles` (`["class_teacher","cover_educator"]`) and
   `report.period_fortnights` (2: the agreed workflow's "monthly", N12, in fortnights).

## Out of scope (cut to keep it simple)

Any screen. Delivering a message (WhatsApp or email). Recording consent on a screen. A record of refused sends. An
"out of date" rule in the database and its count (the existing rules stay as they are). Rewording one line without a
rebuild. Refusing an older note when a newer one exists. Moving the Today page's own "waiting" rule. Changing the
child picture (CP-9) or table access (CP-3, CP-4).

## Detailed implementation

- `supabase/migrations/<ts>_report_lines.sql` (timestamp at build, after CP-4 and CP-9): `report_line`, the
  `parent_note` and `approval` columns, the `approval_kind` row and `approval_begins()`, the `approval_list` branch,
  the insert-only and `sent_at` triggers, `report_line_now`, `report_line_decide`, `report_mark_sent`,
  `coordinator_counts`, unique indexes, the `access_table` row, grants and revokes.
- `supabase/seed/config.json`: two settings rows. `packages/engine/engine/checks/rules.json`: regenerated.
- `packages/engine/engine/w4_close/report_lines.py` (new): build lines from facts, write sentences.
  `parent_facts.py`: return evidence ids per fact. `parent_report.py`, `every_report.py`: notes with a period and lines.
- `supabase/seed/prompts.json`, `supabase/seed/prompts/parent_report.v13.txt`, its gold set: inactive until scored.
- `packages/engine/engine/w3_read/k2_reads.py`: counts from `coordinator_counts`. `cli_report.py`:
  `engine report counts --fortnight N` (ids only, no names).
- `apps/web/lib/queries-reports.ts`, `apps/web/app/(app)/growth/reports/page.tsx`: read `coordinator_counts`.
- `workflows.json` N12; tests `test_report_lines.py`, `test_report_send.py`, `test_coordinator_counts.py` (set
  `app.staff_id` with `set_config(..., true)` as `app_web`), and `test_parent_report.py`, `test_k2_reads.py` updated.
- n8n: no change. `docs/notes/CP-19.md`: the branch note.
