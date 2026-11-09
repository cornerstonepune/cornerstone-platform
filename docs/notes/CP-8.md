# CP-8: every period opens its activity

Branch `cp-8-build`, from main at CP-4 (e575a38). Scope `specs/CP-8`, design `specs/CP-8/design.md`.

## What was built
- One additive migration (`20270122090000_a_plan_line_knows_what_linked_it.sql`), no new table (so no `access_table` row;
  `plan_entry` is school-wide). Four columns on `plan_entry` (`link_rule`, `link_run`, `linked_at`, `linked_by`), a constraint
  that a link always names its rule, a trigger that marks a hand edit `person` and takes it out of any run, two
  `security_invoker` views (`plan_line_candidate`, `plan_unmatched`), two functions (`plan_link_apply`, `plan_link_undo`,
  `app_engine` only). The 40 lines the loader linked are tagged `exact_name`. Runs twice cleanly.
- The loader's `plan_entry` insert sets `link_rule` with the activity it sets.
- `engine timetable link [--fortnight N] [--apply]`, `link-undo RUN_ID`, `unmatched [--fortnight N]` in
  `w2_print/cli_plan_link.py`, mounted by `cli_timetable.py`; every count is per fortnight (`FN<n>`).

## Open: item 5 is Nimish's
`docs/decisions/CP-8-not-written-draft.md` (`Decision: show | hide | school-text-only`, `Decided-by:`) does not exist and
is not written here: the answer is his. Item 5's proof fails until it does.

## Item 1 target
Not hard-coded. The proof reads an optional `Target: N%` line in `docs/decisions/CP-8-link-target.md`; without it the
default is "no line with a match is left unlinked". Only `exact_name` exists as a rule: a further rule needs the box dry
run's numbers first (design decision 3), so the share on live may stay near 40 of 375 until CP-15 writes activities.

## Verified
See the pull request for the numbers.
