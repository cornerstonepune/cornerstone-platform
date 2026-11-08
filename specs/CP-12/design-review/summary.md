# CP-12 design review (light: 3 fresh reviewers)

Reviewers: egm-zoom-out, egm-design, egm-codebase-details. All three asked for changes; every blocker and major was applied in
design.md. All three noted that CP-4, CP-6, CP-8 and CP-11 specs are not on main, so their names are now stated assumptions.

| Finding (reviewer) | Applied |
|---|---|
| CP-6 and CP-4 names treated as fact; not on main (all three) | "Dependencies" lists numbered assumptions for CP-4, CP-6, CP-11, with "follow the locked scope if it differs" |
| Acceptance key could cover a different clash: no place, adult or rule values (design, zoom-out) | Key = hash of kind, fortnight, places, adult, rule with fewest/most, count |
| "Same class twice cannot be stored" false: unique key includes valid_from (design) | Exclusion constraint on place and date range |
| Swaps break non-deferrable unique keys on slot and session (design, codebase) | A move swaps contents between two fixed places; places never change |
| Splitting on every move multiplies rows and reopens later clashes (zoom-out, design) | Copy a fortnight's grid once; later moves are plain updates |
| No lock: double copy, approval racing a move, guard racing a move (design) | Advisory lock per (tenant, fortnight) in every write and check |
| Moves after approval skip the check (design) | Refused if they leave an unaccepted clash |
| Class-scoped view hides cross-class clashes from the approver (design) | Approval count in a security-definer function over the whole school |
| `who` not resolvable from the CLI (design, codebase) | `--by EMAIL` through the existing `voice_intake.staff_of` |
| `lead_staff_id` nothing fills (design) | Stated: "same adult" then met in tests only; live prints "not checked" count |
| Discard leaves moves, next regenerate refused again (design) | Count only moves after the last generation |
| Sessions: `moved` state, holidays, missing school_day (design, codebase) | Explained; holiday and missing day refused; non-planned refused |
| `tt_rules.py` treats `valid_to is null` as current (codebase) | Fixed-slot edits made date-aware; test listed |
| Setting belongs in the seed file (codebase) | `supabase/seed/config.json` |
| New engine files must go on N4's `files` (codebase) | Stated |
| Acceptance keyed by one class (zoom-out) | Class column dropped; school-wide in CP-4's list |
| Nits: no per-file ceiling, 150 rows is a forecast, week A/B is from the date, clear empty reason, timezone, under_limit with zero lessons, wording of decision 7, duplicate decision 5 | All applied |

Not applied: a link for "Nimish, 8 Nov" beyond CP-6's issue #454 (the decision was relayed in a session, not written in an issue).
