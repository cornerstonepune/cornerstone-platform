# 0112 — A blank birthday on the class list enrols the child with birthday not known

Date: 2026-11-25. Status: accepted (Nimish, 25 Nov 2026).
Goal: none — Proved by the blank-birthday ticket's tests (`tests/test_enrol_blank_birthday.py` and its hidden tests).

## Context
The Gurukul K1 list (21 children) has no birthdays; the school fills them in later. `engine enrol class` refuses any
row whose birthday is not read, so it refuses the whole K1 list. `pii.child.birthday` is already nullable
(`supabase/migrations/20261225090000_people_and_enrolment.sql:32`) and nothing outside `core/people.py` reads it.

## Decision
- An empty or whitespace-only birthday cell means "not known": the child is enrolled with `pii.child.birthday` NULL.
  No migration.
- A birthday that is written but unreadable, or outside `AGE_YEARS`, still refuses the row, and so the whole run,
  exactly as before. Only blank is "not known"; a slip is never stored as blank.
- Matching an existing child (`_same_person`): a blank list birthday matches whatever birthday is held. It never
  clears a held birthday and never makes the child look like a different child. Re-running the same blank list
  changes nothing.
- On the --match-existing path a list birthday is still added only where none is held; a blank adds nothing.
- Two rows with the same name and both birthdays blank are refused as the same child (the existing rule, keyed on
  name + birthday). Filling in one birthday is the way through. Assumed, not asked: double-typed rows are the likelier
  slip in a 21-child list than two children with one full name.
- The age-check words become grade-neutral ("not a K2 child's" → "outside the ages a class list holds"); K1 uses it now.

## Consequence
Children can be on a class with no birthday. Anything later that needs an age (none does today) must handle NULL.
Re-running the list with birthdays filled in does NOT add them today: a child already enrolled in that class is
"already there" and untouched (only the --match-existing path adds a missing birthday). Filling birthdays in later
needs its own ticket when the school sends them.
