EGM artifact directory: specs/CP-4/design-review

# CP-4 design review: what each reviewer found and what was done

Reviewers (fresh, no conversation history): zoom-out, design critic, implementation readiness, codebase details.
All four returned NOT READY on the first draft. Full reports were returned in the session; this file keeps the dispositions.

| Finding (reviewer) | Disposition |
|---|---|
| Views section solves a non-problem; all views are `security_invoker` (all four) | Verified. Section deleted; guard test kept. |
| Sign-in path reads/writes more tables than listed; a signed-in-only rule silently turns off the brute-force throttle (design, codebase, zoom-out) | Accepted. Seven tables named from `auth.ts`, `password*.ts`, `web-errors.ts`. School-wide tables keep today's open rule; the scope's "signed-in" wording goes to Nimish. |
| `open_before_sign_in` would open `config` writes (design, zoom-out) | Moot: exception removed. Config hole named as pre-existing; threat model stated: rules do not stop someone holding the web password. |
| `test_roles.py:171-181` asserts `app_all`; "unchanged" cannot hold (all four) | Accepted: rewritten with equal strength, told to Nimish. |
| Ring B "truncate" claim false; engine under `app_engine` test fails for other reasons (readiness, codebase, zoom-out) | Accepted: replaced by a policy and privilege-snapshot proof. |
| No derivable classification of ~155 tables (readiness, design, codebase) | Accepted: ordered rules, explicit exemptions, phase-1 generated table read by the verifier, stop rule. |
| Child data with no `child_id` (`capture`, `item_result`, `narrative_observation`, `gold`, `page_choice`, `capture_page`, `mistake_named`, `class_card`, `sheet_template`) (codebase, design) | Accepted: key types for the capture family, `sheet_template` school-wide, `class_card` through a stated section mapping or a stop. |
| Nested `parent` chain: cost and semantics (design, readiness) | Accepted: replaced by `my_ids` helpers; a measured gate with a fallback. |
| Null links hide unmatched scans (design, codebase) | Accepted: uploader visibility; null-key rule stated. |
| `access_log`/`consent` are coordinator-only in the register (design, zoom-out) | Accepted: own kinds with `own_classes` none. |
| Unlisted table: raise at migration time (design) | Accepted. |
| Reuse CP-3 `signed_in` group / `kind_code`; `kind` name collides (zoom-out, design, codebase) | Partly: column renamed `data_class`; school-wide kept outside the reach rows (see above). |
| Definer functions take a child id (design) | Named as a known gap with a follow-up scope; not built (outside the locked scope). |
