# CP-54 code rules: what code decides for the four scored skills (branch cp-54-code-rules)

Step 1 of "Next, in order" in `CP-54-handover-backend2.md`: the failure categories code can decide, decided by code
(CLAUDE.md rule 11). No model, no priced run, no workflow dispatch on this branch.

## Verified

Local, 17 Nov, no Postgres in the box (`pip install pytest psycopg anthropic ruff pyright==1.1.414`):
- `python -m pytest -q tests/test_rules_choose.py tests/test_skills.py tests/test_layout.py` -> all pass except the
  tests that need a database or a module not installed here (`test_loading_the_settings_…`, `test_every_command_the_map_names…`: segno).
- `tests/test_chain_choose.py` (4 tests changed or added) skip without `DATABASE_URL`: CI is their proof.
- `ruff check engine tests`, `ruff format --check engine tests`, the map's complexity limits: clean. `pyright` on the
  changed files: no new error (the 4 in `tests/test_skills.py` are main's).

What code now decides (tests in `packages/engine/tests/test_rules_choose.py` unless named):
- A. learning-objective: a range (its numbers) no source gives passes only with confidence low and the assumption
  written; materials or a way of working the writer chose are not a fault (30 of 30 approved tune answers carry no
  assumption and many add materials at high or medium confidence: refusing those would refuse the school's own answers).
  SKILL.md rule 3 says so for writer and validator; version 2 -> 3 (rule 2: changed prompt text is a new version).
  A seed file's row (no confidence) is not held to the range rule.
- B. learning-objective `verb_signal` (lists.json): draws -> Conceptual, guesses -> Foundational. Code sets it.
- C. sibling duplicate: compared without the "The child" opening every objective shares.
- D. capability-link: domain default by code, no call, unless the objective is a character one, its default is not on
  the shortlist (the spine reaches another capability), or its verb is on `verb_groups` (then the list is that
  capability's groups). `verb_groups` is empty: no tune verb leaves the default twice. A heading with no verb gets the
  default marked low with its assumption. The eval goes through the same `machines.choose`.
- E. placement: a label that is the very name of a subject, routine or character area on the list is placed by code;
  four kinds only is a code rule.
- F. skill-link: the list is kept to the objective's subject in the machine (`rules_choose.skill_link_first`) and in
  the chain (`chain_choose.skill_lo_jobs`, which also stops asking a maths skill as "Science"). The eval gives the cases
  the subjects the chain would (`evals.with_subjects`, from the seed); gold.json is unchanged.
- All three choose skills: the reason names the words of what was given and of the choice (code adds them when the
  model's reason does not), and an inexact pick is marked low with its assumption (`rules_choose.complete`).

Lists were built from the tune half only (LO 30 tune cases, capability-link 29 tune cases, held 0); the tests rebuild
them from the tune half and hold the files to that recipe.

## Handoff

- Not pushed: the orchestrator pushes and opens the PR after #822 merges.
- Then: merge, deploy, `skill_tune_four` (pre-approved), the held re-score.
- Found, for the orchestrator: capability-link's gold `choice_in` is exactly the spine's groups while its cases offer
  every group; the chain offers the spine's. The eval measures a harder question than the chain asks.
- Found: skill-link gold cases MD.MULTIPLES (tune) and MD.WORD (held) carry input subject "Science" / "Literacy", made by
  the chain bug fixed here; the file is left as the school's, and the eval adds the right subject code from the seed.
