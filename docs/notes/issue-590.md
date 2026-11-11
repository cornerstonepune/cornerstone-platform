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
