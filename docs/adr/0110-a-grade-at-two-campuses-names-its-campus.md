# 0110 — A grade at two campuses: the class-list import names its campus

Date: 2026-11-24. Status: accepted (Plan, unattended; follows Nimish's ADR 0109).
Goal: none. Proved by ticket #939's tests (`tests/test_enrol_campus.py` and its hidden tests).

## Context
ADR 0109: K1 runs at Gurukul and at Neev, and the pilot is Gurukul K1. So `school.campus_grades` lists K1 under both.
Read on 24 Nov, `people._class_ids` (on main and in #938) finds the class's campus from that setting. A grade at two
campuses matches two campuses, and the import refused with the wrong words ("no campus holds grade K1"). Changing the
seed alone would have stopped the K1 import. The class lookup also ignored campus.
`school_class_label_key` (cp27) allows one class of a label per school per year, and the import labels a class by its
grade. So a Gurukul K1 and a Neev K1 cannot both exist in one year.

## Decision
- `engine enrol class` takes `--campus`. It is needed only when the setting gives the grade to more than one campus.
  Without it, the import refuses and names both campuses. It never picks one.
- A class is looked up at its own campus. If that year's class of that name is already at the other campus, the import
  refuses in words, on a dry run too. It never reuses that class and never crashes on the constraint.
- The seed change (K1 under Gurukul too) ships on #939's seed branch, with the code that can read it.
- Not done: `timetable load`/`load-k1 --campus` (#940, closed). Two classes with the same grade and section cannot
  exist in one year today, so the loader's `k2_ctx` still matches one class.

## Consequence
Neev K1 and Gurukul K1 cannot both be enrolled in the same year until classes are labelled per campus (e.g. "K1 Neev").
That label is what children and educators are called by, so changing it is a product decision for Nimish. It blocks
nothing in the Gurukul pilot. When Neev K1 joins, reopen #940 with it.
