# CP-18 design review (light: 3 fresh reviewers)

Reviewers: egm-zoom-out, egm-design, egm-codebase-details, on the first draft. All three asked for changes; every blocker
is applied in design.md. All three noted that `specs/CP-6` and `specs/CP-8` are not on main (they are on the
orchestrator's branch); the design now names CP-4 and CP-6 as unmerged and marks what is assumed.

| Finding (reviewer) | Applied |
|---|---|
| A nightly run can deliver a reminder for a list sent meanwhile (design, blocker) | Per list: lock the row `for update` where draft, re-read pending, commit per message |
| Two runs at once both send; crash re-sends (design, blocker) | Tenant advisory lock per run; `on conflict do nothing`; at-least-once stated |
| Consent check inside a faked adapter, never tested (design, blocker) | All rules in `materials_remind.deliver_due`; adapter only sends |
| `app_engine` cannot read `pii.staff` (codebase, blocker) | Contact read through `pii.read_staff` (logged), one helper |
| A `min_cases` row breaks `bars.short` (codebase, blocker) | `score()` reports `lines`; bar row `eval.materials_read.lines` 60 |
| `notify.py` in N4's files fails `test_layout` (codebase, blocker) | Named in the shared `adapters` entry; commands on N4 |
| Missing summary and CP-6 file (zoom-out, design, blocker) | This file; CP-6/CP-4 marked unmerged |
| Consent table not needed for email (zoom-out) | Dropped; comes with WhatsApp if chosen |
| `to_staff[]` but link reaches one number (zoom-out, design) | One staff id per setting; `to_staff uuid` |
| Email sender already exists in `apps/web/lib/mail.ts` (codebase) | Same SMTP contract and words; `notify.from`/`notify.channel` dropped |
| Photo cases cannot be scored by the eval (codebase) | Eval loads image by key; photo counts only toward `held_back_right` |
| `held_classes` is staff→classes (zoom-out, codebase) | New `holders` query, same setting |
| Approval check vs text not one moment; consolidated rule (design) | Check after the lock; edits take the lock; consolidated refused unless every list approved |
| Old drafts swept up; failures retried forever (design) | Owed only while `today <=` first needed day |
| `not configured` once vs later fix; missing contact status (design) | Second partial unique index; `no contact` status; still owed when fixed |
| Box proofs read literally fail; prove too little (design) | Credential guard only for non-box tests; owed-with-no-row and failed counts added |
| Incomplete file list, routes 500 (codebase) | Tests, routes (409), docs pointers added |
| Grants wording (codebase) | Defaults stated; `revoke select` from `app_web` |
| Email route of sends vague (zoom-out) | Stays `not configured`; out of scope |
| `due_counts` returns counts; `state='draft'` filter (codebase) | New row query; CP-17 approval must not change list state, or queries widened |

Not applied: moving signatures to `plan.md` (zoom-out nit). The house style (CP-8) keeps them in the design.
