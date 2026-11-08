# CP-14 design review: summary and dispositions

Three goldfish reviewers, fresh context, on the first draft of `specs/CP-14/design.md`: zoom-out (simplicity and scope),
codebase-details (accuracy against the code), implementation-readiness. All three said "revise". Every finding below was
applied to the design unless marked otherwise.

| # | Finding (reviewer) | Severity | Disposition |
|---|---|---|---|
| 1 | A person cannot reject a proposed link; goal 4 ("none left proposed") would force a false confirmation then a withdrawal (zoom-out) | blocker | Applied: withdraw covers proposed and confirmed links (M3). |
| 2 | `curriculum_edit_record_check` refuses record `skill_link`; `curriculum_edit_kept` reads `new.code`, which `skill_link` lacks (all three) | blocker | Applied: widen the check; new `internal.skill_link_kept()` with code `before>after`. |
| 3 | The confirmation trigger is shared with `skill_prerequisite`; reading withdrawn columns there breaks it (codebase) | blocker | Applied: table CHECK on `skill_link`; shared trigger unchanged. |
| 4 | History "who" is `app.changed_by`, not a staff id (codebase) | major | Applied: the three functions set it. |
| 5 | `planned_in.week`: no week on `fortnight`; data almost empty until CP-8 (all three) | major | Applied: fortnight mark dropped from CP-14 (non-goal; with CP-8). Former decision N2 removed. |
| 6 | Confirmer rule not in any goal; a true/false setting doubles test paths; `skill_prerequisite` has no proposer (zoom-out, readiness) | major | Kept as Nimish's decision N1 (it is a safety rule he should choose); made a fixed rule, scoped to `skill_link`; `load --by` required. |
| 7 | "Other columns ignored" means a second CSV reader; reuse `pairs()` (zoom-out, readiness) | major | Applied: `confirm --file` takes the loaded file, read by `pairs()`. |
| 8 | `ready_next` "also returns blocked" contradicts "output unchanged" (zoom-out, readiness) | major/nit | Applied: separate `blocked()`; `ready_next` unchanged. |
| 9 | Return words of the new functions unspecified (readiness) | major | Applied: listed. |
| 10 | Reconfirm leaves stale withdrawn fields; `withdrawn_reason` not in history (codebase, readiness) | major | Applied. |
| 11 | Adding a parameter to `propose_skill_link` makes an ambiguous overload; redefinitions drop CP-5's pinned search path; vocabulary must be re-run (codebase) | major | Applied in the file table. |
| 12 | Grade match uses `school_class.grade_code`, not `child.band` (codebase, readiness) | major | Applied; build checks `activity.band` values. |
| 13 | Engine code may not name `skill_link`; the live count goes in `checks/links.py` via `skill_link_audit` (codebase) | major | Applied. |
| 14 | Commands live in `cli_skill_links.py`; `k2_*` files are N9 with no frozen ceiling (codebase) | major/nit | Applied. |
| 15 | Goal 1 "names them" not checkable; goal 4 "every link in the list" not provable from the database (readiness) | major | Applied in the scope wording. |
| 16 | CP-4 section too long (zoom-out) | nit | Shortened. |
| 17 | Signature block too close to code (zoom-out) | nit | Reduced to the rule and inputs. |

Checked by the author after review: `activity_skill.skill_code` and `skill_link` use the same codes (`registry_skill`,
renamed from `skill` in migration `20261201090000`), so the activity rule can fire.
