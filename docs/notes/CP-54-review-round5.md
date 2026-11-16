# CP-54 review, round 5: objectives only (16 Nov 2026)

## What was reviewed

The files reviewed are `lo_rewrites/<band>.json` at these heads:

| Band | Head |
|---|---|
| G1 | 71aa7abc6 |
| G2 | dc7eff31c |
| G3 | 619b2be5e |
| G4 | 557b937f4 |
| K2 | 3b953108a |

The sample was drawn fresh with seed 20261118, so no row from rounds 3 or 4 was reused. It covers:

- 40 random rewrites per band, plus 20 near-twin rows for K2;
- up to 15 new LOs per band;
- every LO or new-LO row that failed in round 4, rechecked.

One reviewer agent per band applied the same written rubric as before. The full verdicts are in `CP-54-review-round5.json` (`rows`, `failing_rows` with reason and fix).

## Verdicts (bar: at most 10 % errors on the random sample)

| Band | LO error, round 5 | Pooled with round 4 (80 rows) | New-LO error | Verdict |
|---|---|---|---|---|
| G1 | **5 %** (2/40) | **3.8 %** (3/80) | 0 % (0/10) | **LOAD** |
| G2 | 37.5 % (15/40) | 26 % (21/80) | 13 % (2/15) | DO NOT LOAD |
| G3 | 25 % (10/40) | 20 % (16/80) | 7 % (1/15) | DO NOT LOAD |
| G4 | 17.5 % (7/40) | 17.5 % (14/80) | 33 % (2/6) | DO NOT LOAD |
| K2 | 15 % (6/40); near-twin rows 10 % (2/20) | 14 % (11/80) | 40 % (6/15) | DO NOT LOAD |

**G1 has two rows to fix before or while it loads:**
- LO-G1-0464 (No Screen Day): change to `fold_into_unit`.
- LO-G1-0314: give it a condition that separates it from LO-G1-0316.

## Round-4 failures: now fixed

- **G1:** both rechecked rows are fixed. Three new LOs are no longer in the load file: AUD-VE-03, AUD-RTN-05 and G1-NEW-036.
- **G2:** all 6 rechecked rows are fixed. G2-NEW-012 and G2A-NEW-017 are removed.
- **G3:** all 6 rechecked rows are fixed. G3-NEWA-004, G3-NEWA-007 and G3-NEW-033 are removed.
- **G4:** all 8 rechecked rows are fixed. G4-NEW-053 and G4-NEW-064 are removed.
- **K2:** all 8 rechecked rows are fixed. Six new LOs are removed.

No round-4 failure is still present. The rows that still fail are other rows in the same files with the same kinds of fault.

## What is still wrong (all listed in `failing_rows`)

1. **Rows whose source is only an event, a purpose or a quality, rewritten into an assumed action.** These should be `fold_into_unit` or `needs_human`.
   - G1: 0464
   - G2: 0571, LONEW-026
   - G3: 1045, 1197
   - G4: 1445, 1446, NEW-012
   - K2: 0081-2, 0274-1, 0286-1, 0300-1, 0466-3; new LO 5-027 (conduct)
2. **No condition, or an answer form that is not stated.**
   - G2: 0520, 0721, 0781, 0878, 0925
   - G3: 1020, 1023, 1279, NEW-006
   - G4: 1598, 1635, 1715
3. **List items dropped with no "not covered" note, and two actions in one title.**
   - Dropped list items: G2 Hindi grammar rows 0719, 0729, 0734, 0744, 0758
   - Two actions: G3 1086, 1109; K2 0655-1
4. **K2 duplicates.**
   - The same "moral of <story>" is asked twice, once in the K2-NEW-5/4 series and once in the R2 series. There are 17 such pairs in the whole file. Examples: 5-043 and R2-3-001, 5-051 and R2-3-009, 5-059 and R2-4-005; all are listed in the json.
   - The Wolf in Sheep's Clothing families still overlap: 0846-1 duplicates 0734-1, and 0733-1 duplicates 0845-1.
5. **Folds justified by a "twin" in another unit or subject.** G4: 1472, 1548.

## Fastest path

Fix the rows in `failing_rows` for G2 (17), G3 (11), G4 (9) and K2 (14, plus the 17 duplicate pairs), then re-run this check.

G2's jump from 15 % to 37.5 % comes mostly from one pattern, the dropped Hindi list items (5 rows). Fixing that pattern alone would bring G2's round-5 sample to about 25 %.
