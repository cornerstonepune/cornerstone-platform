# CP-19 design review: summary

Four fresh reviewers (EGM goldfish: zoom-out, design, codebase details, implementation readiness) read the first draft
of `specs/CP-19/design.md` on 8 Nov 2026, unattended. Each finding below is applied in the revised design unless marked.

## Blockers (all applied)

| Finding | From | Applied as |
|---|---|---|
| `current_staff()` reads a setting any role can set, so the engine could pose as two people | zoom-out, design, codebase | Approve and send only in `security definer` functions executable by `app_web` alone; insert on `approval` revoked from the app roles (mechanical decision 3) |
| Engine routes cannot see the website's staff id, so every approval would be refused | design, codebase | The website calls the functions over its own connection; engine approve route retired for new notes |
| A transaction flag as the `sent_at` backstop can be forged | zoom-out, design | Trigger checks `current_user` is the functions' owner |
| A note with no lines, an old note, or a stale note passes "every line approved" | readiness, design | Refusals `no_lines`, `old_report`, `not_newest`, `out_of_date` |
| `parent_facts.py` selects answer ids, not evidence ids; "confirmed" is `confirmed_by`, not a status | codebase, design | Lines map each fact to its `evidence_event` rows; checks use `confirmed_by is not null` |
| `approval` has no step, `by` is not null, a not-null `staff_id` fails on old rows | readiness, codebase | `step` and `staff_id` nullable with a check for `report_line`; `by` filled from the staff id |
| Rebuild, retire and sent-back rules undefined | readiness | A rebuild is a new note; wording fix is a superseding line; sent back is final for a line; precedence written out |

## Majors (applied)

- A second "what is waiting" view: `approval_list` gets a `report_line` branch instead.
- New roles setting duplicated `k2.reads.coordinator_roles`: step 2 reuses it; step 1 uses `staff_role_grant` on the child's class.
- `thin_evidence_min` duplicated `state.min_events`: reused; thin computed on read, not stored.
- Races on concurrent approvals and send: note row lock, unique indexes on (line, step) and (line, staff).
- Out-of-date defined in SQL as one function; the website's existing rule moved into the database.
- Week to fortnight change in the coordinator's counts named; rows stay in Python (their state comes from `voice_intake.resolve`).
- Per-educator counts could be read as a rate: moved to Decisions for Nimish (3).
- Missing files added: `rules.json`, `queries-today.ts`, `prompts.json`, eval gold set, existing tests; n8n "no change" stated.
- Ordering: the build waits for CP-4 and CP-9 to merge (the migration's `access_table` insert needs CP-4).
- Risks and mitigations section added; the work split into three phases.

## Contested

- **Drop `report_send` and the refusal record** (zoom-out): kept. The earlier draft of this scope promised the refusal is
  recorded, it is one insert-only table, and it lets the coordinator count refused sends.
- **Store a facts fingerprint per line for out-of-date** (design): not taken. It cannot be computed in SQL, so the counts
  could not read it; the evidence-based rule is kept and its blind spot (a changed setting) is stated.
