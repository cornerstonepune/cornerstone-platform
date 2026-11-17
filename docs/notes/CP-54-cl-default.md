# CP-54: capability-link answers academic objectives by their subject default

Orchestrator decision, 17 Nov (standing order "nothing empty"): on the tune half the model left the subject default 4
times and was right 0 times (gold .55, against .69 for the default alone). So code now gives an academic objective whose
subject default is on its shortlist that default, with no model call: confidence low, assumption "the subject default:
an academic objective counts toward its subject's group until an educator changes it", written as the machine's row
(`objective_statement.source = 'machine'`), so a person can change it and a person's link is never overwritten
(`apply_seed._capability` skips an objective whose link is not the machine's).

- The switch is data: `supabase/seed/skills/capability-link/lists.json` key `"academic"`, `"default"` (now) or `"ask"`
  (the option-a rule). Any other value is refused. Read by `rules_choose.capability_first`, which `machines.choose` runs,
  so the chain (`chain_choose`) and the eval (`evals.evaluate`) take the same path. `left_default` counts stay.
- Character objectives, routines (no subject, so no subject default to stand on; contract `kind` now admits `routine`)
  and an objective whose default is not on its shortlist are still asked, as before.
- The chain now covers every active objective with no capability, whatever its grade: an objective whose title is
  still blank (its heading sits in the unit; 236 in the seed) was left out and is now read by its unit.
- `engine curriculum chain-link capability --estimate` (the curriculum run `chain_forecast`) counts no call for a job
  code answers, says how many those are, and prices in rupees as well as dollars. `evals.calls` likewise counts no maker
  call for a case code answers.
- SKILL.md standard 3, 4 and 6 rewritten for this; version 2 → 3 (the prompt's text changed). Its eval is not run in
  this branch (no model call); the skill is still `active: false`.

## Verified

- `pytest tests/test_rules_choose.py tests/test_chain_choose.py tests/test_skills.py tests/test_curriculum_run_command.py
  tests/test_layout.py tests/test_core_budget.py` on a fresh `bin/testdb schema` database: 182 passed.
- `bin/check`: 64 passed, 4 skipped. ruff check and format clean; pyright on the four changed engine files: 0 errors.
- Forecast on the seed copy (not live; live was not reachable from this session and has K2 rows the seed lacks):
  before, 1514 to ask, 1514 calls, $2.91. After, 1750 objectives, 1224 by code with no call, 526 calls, $1.05 (₹92):
  academic 1631 objectives, 407 calls (₹71); routines 119, 119 calls (₹22).

## Handoff

- The 407 academic calls left are objectives whose spine shortlist (the capabilities their registry skills reach) does
  not hold the subject default: Science 174 and Global perspectives 84 (spine: reasoning only), Home Science 121 (spine:
  society and planet), Visual Arts 28. The decision keeps them with the model; adding the default to the shortlist
  would make them ₹0 too, and is the orchestrator's call.
- Every code-default answer is low confidence, so `chain_disagreements.capability` will list them all as "unsure".
- Next: `chain_forecast`, then `capability_link` (both curriculum runs) once this merges.

## 17 Nov, backend3 (code-fix batch on this branch)
- Map, from tune gold (>= 3 consistent cases only): SCI and GP default -> `v2-reasoning.change-my-mind` (Science 4/4, GP 3/3
  in v2-reasoning). Home Science (1) and Visual Arts (1) unchanged; G3-G4 "Visual Arts" units are GP by `by_unit`, so follow GP.
  Numeracy's default is already in its gold domain (19/19). Test holds the map to the tune gold.
- Headings: `verb()` reads a trailing "/" and capability-link `heading_starts` (tune only) as headings.
- Placement (held_pl clean .435): exact = short form (FMS, GMS) or every label word in the name ("Maths" ~ "Mathematics");
  "Science & Geo" no longer exact; a part keeps the model's confidence; code reason says "character area" (`kind_names`).
- Skill-link: one pick (first kept, rest named in the assumption, low). Every CHOOSE answer that writes an assumption is low.

## "Machine default" tagging: no schema change (17 Nov, backend 5)
`objective_statement` has no confidence column, and none was added. Each capability link an apply run writes is already
recorded on that run (`flow_run`, flow `curriculum.apply-seed`, `result.changes`); the change now also keeps the answer's
`confidence` and `reason`. A code default reads `confidence: low` and a reason ending "the subject default '<group>'"; the
link's `source` stays `machine`. Rejected: a new `source` value (reads as person-set to the `source != 'machine'` guard), a
`curriculum_proposal` row per link (its `kind` rule has no capability kind, so it needs a migration, and about 1,500 rows
would land in the review queue), a new column (a migration, for what a run record already holds).
Proof: `test_apply_seed.py::test_a_run_keeps_how_sure_each_capability_was_and_why_so_a_code_default_can_be_found`.

## Placement switched on (17 Nov, backend 5)
held_pl on `73edcef` (run 44072677453): gold 1.000, clean 0.870, catch 1.000, smoke 1.000, not_worse 1.000 - every bar met. Actual cost: read from flow_run.
`supabase/seed/skills/placement/SKILL.md` -> `active: true`. There is no `chain-link placement` runner (kinds are capability, skill_lo, topic): placement answers a label, and the
objectives under a label take their subject from `k2_label_placement.json` through apply-seed. Live, 514 in-scope objectives have no subject: 394 character and 110 routine (none by
design) and 10 academic, so the subject count can rise by at most 10 whatever runs.

## Capability fill by code alone (17 Nov, backend 5)
held_cl: gold 0.645 (bar 0.70). Nimish chose "a" (#775, 11:44): fill now by the subject default, low, editable; the model skill stays off.
New run `capability_default` = `chain-link capability --code-only --apply`: academic objectives take their subject's default (from
`rules_choose` where it is on the shortlist, else the same default with the reason that the spine's groups do not hold it); character and
routine objectives are left (no honest default) and counted. No model call, nothing spent. A person's capability is never replaced
(`apply_seed._capability`). Confidence and reason are on the run's `flow_run` record.
