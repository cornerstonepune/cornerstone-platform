# CP-54 objectives: full pass of every row (16 Nov 2026)

This pass checked every row of `supabase/seed/curriculum/lo_rewrites/<BAND>.json`, covering both rewrites and new_los, at these heads:

| Band | Head |
|---|---|
| G2 | data/g2 dc7eff31c |
| G3 | data/g3 619b2be5e |
| G4 | data/g4 557b937f4 |
| K2 | data/k2 3b953108a |

Each band was checked by one reviewer agent; K2 was split into three parts. All used the written rubric with the five round-5 patterns. I then assembled the results, applied the overrides listed below, and linted the fix texts.

**Per-band files:** `CP-54-review-full-<BAND>.json`. Each file has a `summary` and a `failing_rows` list. Every failing row carries `key`, `pattern`, `reason` and `fix_text`, which workers paste verbatim.

## Counts

| Band | Rows checked | Failing | Rewrites failing | New LOs failing | P1 | P2 | P3 | P4 | P5 | other | needs_human |
|---|---|---|---|---|---|---|---|---|---|---|---|
| G2 | 479 | **85** | 82 / 448 (18 %) | 3 / 31 (10 %) | 16 | 26 | 32 | 4 | 0 | 7 | 1 |
| G3 | 430 | **58** | 55 / 397 (14 %) | 3 / 33 (9 %) | 11 | 20 | 15 | 11 | 0 | 1 | 0 |
| G4 | 438 | **87** | 84 / 426 (20 %) | 3 / 12 (25 %) | 9 | 37 | 25 | 3 | 11 | 2 | 1 |
| K2 | 1,390 | **216** | 179 / 1,192 (15 %) | 37 / 198 (19 %) | 129 | 14 | 3 | 51 | 0 | 19 | 27 |

What the patterns mean:

- **P1:** an event, purpose, quality or conduct row was rewritten into an assumed action. Fix: `fold_into_unit`, `remove`, or `needs_human` where the K2 practical-life act is unknown.
- **P2:** the row has no condition, does not state the form of the answer, or uses an unobservable word.
- **P3:** list items were dropped without a "not covered" note, or the title has two actions.
- **P4:** the row duplicates another. This includes 18 K2 "moral of <story>" pairs and the Wolf in Sheep's Clothing twins.
- **P5:** the row was folded onto a "twin" in another unit or subject. These rows are restored with their own content.

## Forms of fix_text, all ready to paste

| Form | What the worker does |
|---|---|
| A title starting "The child …" | Set it as new_title (action rewrite). |
| `<title> || note: other items (…) not covered` | Set the title, and append the note to `note`. |
| `fold_into_unit` | Set action to fold_into_unit. |
| `fold into <code>` | Fold this row into the named row. |
| `remove: duplicate of <ref>` or `remove: conduct …` | Delete this new LO. |
| `needs_human: <question>` | Hold the row for a coordinator. There are 29 in total, 27 of them in K2: mostly practical-life rows, the clay family, and art rows whose real act is unknown. |

## Lead-reviewer overrides

- **G2, G3, G4:** event and routine rows that a band reviewer had sent to `needs_human` were set to `fold_into_unit`, to match earlier rounds. These are Science Week, Pi Day, Quiz, Evaluation, No Screen Day, No Uniform Day, Think Outside the Box, field visits and the like: 10 in G2, 10 in G3, and 1 in G4 (the bank visit). Sports Classes stays `needs_human` (LO-G2-0916, LO-G4-1737).
- **G4, `verify_before_paste`:** seven fixes add a detail that is not in the source, such as a setting or an example. These are 1400, 1458, 1472, 1530, 1537, 1572 and 1619. Confirm each one, or drop the detail.
- **G2, `apply_manually`:** G2-LONEW-032 and G2-LONEW-033 need their subject changed to Global perspectives. This is a metadata change, not a title, so it cannot be pasted.
- **K2:** LO-K2-M0103-1 folds into LO-K2-0322-1. This duplicate was found by the K2 part-2 reviewer.
- **Lint:** every pasteable title starts "The child", is 25 words or fewer, and uses no banned word. "carry" in LO-G2-0734 refers to a मात्रा, not to sums.

## After the fixes are applied

Re-run a 40-row sample per band. If the fixes are pasted verbatim, the five patterns should not recur.
