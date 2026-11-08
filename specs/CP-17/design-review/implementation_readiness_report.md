# CP-17 EGM stage 9: implementation readiness (implementation readiness, codebase details)

Reviewers: egm-implementation-readiness, egm-codebase-details (fresh context). Verdict: not ready, then fixed. The
codebase reviewer confirmed the other citations (`material_item`, `staff_role_grant`, `materials_line` unique per list and
code, `materials_send`, the send flow, both "tracked" checks, `internal.forbid_change`, `config` shape, C5 `firsts`).

| Sev | Finding | Resolution |
|---|---|---|
| 🔴 | A direct insert into `materials_list_approval` would skip the "lines shown" check | Every D6 check runs in the `before insert` trigger; the caller supplies the digest it showed; no separate function |
| 🔴 | A truncate trigger breaks `engine live copy` (removed on purpose, `20261226100000`) | Dropped; truncate is already revoked by `apply_conventions()`; proof checks the grant |
| 🔴 | `fortnight` is on main, not CP-6 | Moved under "what exists"; only `fortnight_cycle`/`fortnight_is_frozen` wait for CP-6 |
| 🔴 | Approval kind seeded two ways (`approval_begins` and `vocabulary.json`, checked equal) | Both named, with ord, words and rerun |
| 🔴 | `:257-264` is the educator's `add()`, not the rebuild | Cited `:79-106` only |
| 🟡 | `firsts` column types | `target = id::text`, `first_by = approved_by::text` |
| 🟡 | `access_table` needs `kind_code`, `key_type` | Same as the `materials_list` row |
| 🟡 | "Today" undefined for open grants | The school's date from `school.time_zone`; inclusive both ends |
| 🟡 | Website `kept` would trip the D9 search | Named as display of the engine's value, not a rule |
| 🟡 | Tracked computed per row in Python | In SQL; a missing setting is an error |
| 🟡 | Test files and the shared fixture unnamed | `test_stock.py`, `test_materials_approval.py`, `test_tracked_rule.py`; `approvable()` in `materials_rows.py`; affected send tests named |
| 🟢 | Send trigger did not lock the list | Takes it `for share` |
| 🟢 | Missing column checks | `counted_on_hand` only for counts; `class_id` for issued/returned; caller's `counted_change` overwritten |
| 🟢 | `security_invoker` on the view; "malformed" setting | Stated |
| 🟢 | Why not reuse `_last_send` text comparison | One line: the text has names and no codes |
| 🟢 | No phasing | Left to `plan.md` at build, stated |

Not checked by either reviewer: CP-4's final `access_table` shape and CP-6's functions (both unmerged).
