# CP-54: learning-objective v5 wording (DRAFT, not applied; no LO run until Nimish answers P1/P2/P3)

Orchestrator's recommendation (17 Nov): P1 (action assumed from a purpose-only line) and P2 (no condition stated) are acceptable
when marked `confidence` low with the assumption written; a fault only when stated with confidence (medium/high) or with no
assumption. P3 (parts dropped, no note) and P4 (repeat of a sibling) stay faults.

## Wording to add to SKILL.md standard 3, and a new standard 11 (version 4 -> 5)
3 (add): "Where the source gives only a purpose, write the likeliest action of a child; where it states no condition, write the
likeliest one for the grade. Either passes only with `confidence` low and the assumption written in `assumption` (what the
source lacked and what was assumed). Stated with `confidence` medium or high, or with no assumption, it is refused."
11 (new): "When the source holds several parts and the objective covers one, `note` names what was left for another objective. A
part dropped with no note is refused. (Unchanged in effect: P3.)"

## The planted cases, split (no case deleted)
- Existing planted P1 (12) and P2 (16): all have NO assumption written (checked in the file; 11 of the 28 say medium/high). They stay
  `planted_bad_gold.json`: bad-if-not-marked. Under v5 the validator must still fail every one (catch stays measured on them).
- New `marked_good_gold.json`: 28 twins, the same text with low confidence and the assumption written, "good if marked". They are
  to be passed by the validator (they join `clean`). The assumption sentence is a template per fault, not curriculum content.
- Not wired: the evals read `gold.json`/`planted_bad_gold.json`/`smoke.json`; adding `marked_good_gold.json` to `clean` is a small
  change in `engine/skills/evals.py`, to be made only after Nimish says yes (otherwise the file stays inert).

## Expected effect (a prediction, not a score)
Catch can only rise if P1/P2 are counted as faults when unmarked, which they already were in v3; v4 loosened it to 0.306. v5
restores the check for the unmarked while accepting the marked.
