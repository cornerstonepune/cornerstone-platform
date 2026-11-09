# CP-7 design review (4 fresh reviewers)

Reviewers: egm-design, egm-codebase-details, egm-zoom-out, egm-implementation-readiness. A goldfish review of the
"feature spec" kind, run in one round: lighter than the full interactive preset a tier 3 change would normally get,
following the CP-6 and CP-8 precedent. All four said "not ready"; every blocker and major finding below was applied to
`design.md` and `spec.md`.

| Finding (reviewer) | Applied |
|---|---|
| `internal.approval_checked` refuses every approval of a new kind (design, codebase, readiness: blocker) | `approval_kind.needs_first`; `approval_checked` redefined; old kinds unchanged, with a proof |
| Approver identity from `app.changed_by` is spoofable; tables writable directly (design, codebase: blocker) | `current_staff()` + grant + CP-3 group; the check sits in `approval_checked`; functions `security definer`; app roles only read the tables |
| `week_plan_line` lacks `updated_at`; the conventions' trigger would fail (codebase: blocker) | Column added |
| Second reading of "last week"/"a line" dropped (zoom-out: blocker) | Both readings tabled; decision 1 rewritten as a fair choice |
| A removed period flags forever (design, readiness) | Missing line equals an `empty` line in comparisons |
| An empty week rolls forward unseen (design) | Draft raises when the week has no slot |
| Two last decisions at once leave the week stuck (design) | `for update` on the week; re-check |
| Stale approval passes the gate; drafting in `planning` (design) | Draft only in `frozen`/`aligned`; the gate re-derives the frame |
| Monday-only reading wrong for FN10/FN11 dates (design) | Each line on its real date; two slots for one period raise |
| Send-back discards other approvals; rerun ignores the baseline (design) | Approvals carried to identical lines; the rerun compares the baseline too |
| Settings missing for new schools; numbers repeat yearly (design, codebase, readiness) | Settings in `approval_begins`; exceptions keyed by academic year; `--year` on the command |
| Exception fortnights unworkable by hand (zoom-out) | `week_approve_open`: one action, one row per line |
| Gate goes beyond the goalpost (zoom-out) | Kept as decision 2, with "if no, drop line 8" |
| Educators' view unchanged was hidden in gaps (zoom-out) | Stated in What/Out of scope |
| Decision 3 is mechanical (zoom-out) | Moved to mechanical choices; the setting is named to Nimish |
| `superseded` state and `exception` column (zoom-out) | Dropped |
| Done-when 3 bundled; send-back counting (zoom-out, design, readiness) | Split into lines 3 and 4; "an approved line has exactly one approved row" |
| `vocabulary.json` vs `test_approval_list.py` (readiness) | Seed file added to the implementation list |
| Error stems, signatures, grants, fixtures, LIVE queries, test files, command options (readiness, codebase) | Refusals table, signatures, grants, fixtures, LIVE counts, named suites, command options |
| `forbid_delete` not `forbid_change`; `timetable_version` dropped silently; CP-3 unnamed (codebase) | All three applied |

Not applied: the readiness reviewer's suggestion to read the approver from `app.changed_by` parsed as a uuid. The
codebase reviewer showed that `current_staff()` (`app.staff_id`, set at sign-in) is the verified mechanism.
Gate scope: the reviewers offered "K2 grade only" or "every class with a timetable". Chosen: every class with slots in the
fortnight, so that no grade is named in code (rule 1).

## Second revision (8 Nov, Nimish's decision relayed by the orchestrator)
"A fortnight is the unit of the timetable, and then everything gets derived from that." Week-level approval removed:
`week_plan`/`week_plan_line` became `fortnight_plan`/`fortnight_plan_line` (one draft and one comparison per class per
fortnight; weeks, days and periods are filters). Both open decisions closed by him: the timetable grid is what is
approved; the CP-6 gate stays. Approver: coordinator or "Everything" group, a settings row. Every reviewer fix above is
kept; none was re-reviewed by a fresh reviewer after this change.
