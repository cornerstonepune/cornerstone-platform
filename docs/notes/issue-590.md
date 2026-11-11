# Issue 590: one access rule (grants are the one source)

One migration, `20270126110000_grants_one_source.sql`. No new table, no new function (81 / 121).

- `staff_list` (what the website signs a person in with) now gives `classes` from the person's open grants of the
  own-classes group, and `subjects` from their subject grants. `staff.classes` / `staff.subjects` are no longer read by it.
- Flat rule, flat lists: a person with a grant for a whole class (no subject) is narrowed in no subject; otherwise their
  subjects are those of their subject grants (the site's `staff_sees` takes one list for all classes). A per-class subject
  rule needs `staff_sees` to change (see #605).
- Backfill (inline): for every active person with classes on their old entry and no open grant on that class: classes +
  subjects become `subject_educator` grants (one per class and subject); a class with no subject becomes `class_teacher`.
  The grant table's own rules still apply (one class teacher to a class, D-039): if one refuses, the migration stops.
- Checks that raise: nobody signs in to fewer classes than their old entry named; nobody with subjects on the old entry
  signs in with different ones.
- Live (read-only count, 11 Nov): 4 educators, 3 with classes and no grants (5 class entries, each with one subject), 1 with
  a grant. Expected backfill: 5 `subject_educator` grants (NUM, ENG; no D-039 clash, none is a class teacher). Unverified
  until run on a copy of live (the rehearsal).
- The columns stay (the old staff editor still writes them; nothing reads them). Dropping them is the step after that
  editor is retired (UI-5).

Verified: `tests/test_grants_one_source.py` (7), table-budget, data-register, layout, rules, staff, people, access,
report-lines, approval-list and voice tests on a from-scratch Postgres 16; `bin/check`. Not verified: CI's full suite;
the rehearsal; live.

## 11 Nov, after the first full CI (browser shards red)
- Cause: the web test helper `k2-rows.ts` gives the shared test coordinator a `class_teacher` grant on a K2 class and never ends it. Once `staff_list` read grants, that coordinator signed in scoped to the class and later specs saw a class-prefixed page.
- Root fix, in the migration: a person whose role is `coordinator` signs in with no class or subject list (the engine's `staff_sees` already lets a coordinator see every class), so a class grant a coordinator also holds does not narrow the site. The two guard checks skip coordinators for the same reason.
- Live (read-only, 11 Nov): 3 coordinators, none with old class or subject entries, none holding a class grant: nothing changes for anyone today. Test: `test_a_coordinator_who_also_holds_a_class_grant_is_not_narrowed_by_it`.
- Rehearsal re-run on the changed migration; no web test was edited.
