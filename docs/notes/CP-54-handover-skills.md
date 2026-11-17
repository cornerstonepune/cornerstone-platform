# CP-54 handover: the ten skills, Gate 3 and the chain runs (track B, 17 Nov 01:50 UTC)

Read first: `docs/notes/standing-orders.md`, `docs/notes/CP-54-track-b.md`, `supabase/seed/curriculum/README.md`,
`packages/engine/engine/skills/{machines,evals,spend}.py`, `packages/engine/engine/checks/cli_skill.py`,
`packages/engine/engine/w1_bank/{chain_choose,cli_chain,cli_counts}.py`, `.github/curriculum/command.py`.

## State
- **Merged:** #789 (batch 1: ten skills, bars), #798 (batch 2: data, apply-seed halves), #803 (eval sets, school-context row,
  held-half scoring, seed-goods, check-first list), #805 (nine labels left for placement), #808 (a subject's own name is a
  spelling; `curriculum_counts`), #810 (a rupee ceiling `--max-inr` the engine enforces; eval of named skills).
- **#810 deploy: NOT confirmed live at 01:50.** Deploy run 585 skipped every step (main had moved on). The real deploy follows
  main's CI run 43995255211 for 0fb5a2698. Check `deploy-engine.yml`: a run for 0fb5a2698 whose jobs show "start the engine" and
  the settings step as success (not skipped). Dispatch nothing before that.
- **Live skills:** 0 active. Every skill prompt loads inactive; a skill is switched on only after its eval meets the bars (rule 7).
- **Scored so far:** nothing on the held half. The ₹909.88 spent on `skill.*` since 16 Nov 16:17 was the baseline on agent-written sets.
- **Live data (curriculum_counts 00:44):** objectives live/reworded/retired/new K2 960/357/430/198, G1 467/390/89/77,
  G2 484/369/79/115, G3 326/289/108/37, G4 395/337/89/58; 0 links on the v2 groups (the chain run fills them).

## Order still to do (one run at a time; the server's concurrency group queues, never overlap by hand)
Dispatch: `mcp__github__actions_run_trigger` run_workflow, workflow `curriculum-run.yml`, ref `main`, inputs `{"run": "<name>"}`.
1. `skill_goods` (engine writes the activity answers; ceiling ₹343; 58 cases without an answer). Stops cleanly, lists the cases left.
2. `skill_eval_four` (learning-objective, capability-link, placement, skill-link, held half; ceiling ₹784).
3. `skill_eval_activity` (held half; ceiling ₹140; run only after step 1). The three ceilings never pass ₹924 (a test holds it).
4. `chain_forecast` (no spend): send the orchestrator the forecast before any chain run (local estimates: capability ~$5, skill to LO ~$0.3, topic ~$6).
5. Switch-on PR: set `active: true` in `supabase/seed/skills/<name>/SKILL.md` for each skill that met every bar; one line per skill in
   DECISIONS-LOG.md (version, scores, flow_run cost). A skill below a bar gets a new prompt version (at most 3), re-scored on the held half.
6. Chain runs: `capability_link`, `skill_link_lo`, `topic_fold` (each spends; a named person; they use the ACTIVE prompt). Topic: the engine
   writes the cases, they must pass the code checks, and go live machine-made on the check-first list (`chain_disagreements.topic`).
   Nimish's cap for CP-54 is $100; the campaign stops at $99.

## Reading results and cost
- Job logs: `list_workflow_jobs` on the run id, then `get_job_logs` with `return_content` and a `tail_lines` of 40 to 75 (scores print as
  `gold 0.xxx clean … catch … smoke … not_worse …`; `BELOW` lines name a missed bar; `STOPPED at the ceiling` lists what was not done).
- `list_workflow_runs` output is huge: it is saved to a file; parse it with python (`d['workflow_runs'][0]`). Never use `get_workflow_run`.
- Cost: dispatch `curriculum_counts` (read-only). Its `spend` section is every `skill.*` flow: calls, cost_inr, first, last. Subtract the snapshot
  at 00:44: activity 43.08 / validate 138.34; learning-objective 25.12 / 119.73; capability-link 2.10 / 42.13; placement 3.08 / 40.29;
  skill-link 2.14 / 34.67 (calls and flow_run rows are the API's record; match them with the console).
- Bars (rows `skill_bar.<name>.*`): gold 0.70, clean 0.80, catch 0.75, smoke 0.80, not_worse 1.

## Sets (supabase/seed/skills/*)
learning-objective 60 good / 72 bad; capability-link 60 / 40; placement 48 / 48; skill-link 32 / 32 (thin: mark it so in DECISIONS-LOG);
activity 60 inputs, the school's own activity as the checker's reference (no K2), no answers until `skill_goods`, planted-bad still 14 written
earlier (replace by code corruptions of the engine's answers); topic has only 4 code-certain units (not scorable). Half of each set is held: only it scores.

## Traps
- A deploy kills a running run (exit 137): #809 now makes deploys wait; a merge to main during a run is still a risk. Ask before merging.
- The settings load fails on any spelling `curriculum.subjects` does not know (a deploy then fails at "the settings the code reads"): add it to
  `placement`, or the subject's own name is already a spelling (#808).
- `subject_map` / `rules.json` / `workflows.json` / file ceilings (400 lines; `cli.py` is at its limit) fail CI; `test_layout.py` and `bin/check` first.
- A superseded CI run shows red gates (`engine`, `browser`) from cancelled shards: read the run of the current head only.
- Track C's browser re-deal once put specs sharing database state in one shard (u36, u61); fixed in #809.
- Never print Cambridge words; no children's names; no hand-written curriculum content (the engine's skills write it, on API credits).
- Supabase tools asked for an approval nobody could give overnight and hung the session: work through the server runs instead.
- Local test database is hand-built: `tests/test_question_types.py`, three `test_chain_picture.py`, `test_rules.py` fail locally, not in CI.
