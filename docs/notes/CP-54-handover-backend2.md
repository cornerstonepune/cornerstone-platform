# CP-54 handover: backend finisher, session 2 (17 Nov 2026, ~08:30 UTC)

Read first: docs/notes/standing-orders.md, CLAUDE.md, this note. Orchestrator: session_01KEBF26AbSER2xbWPJjbrmX (report with the claude-code-remote send_message, one short message per gate).
Rules from Nimish: API credits only, all model work on the server via the curriculum-run workflow, never hand-write curriculum content; CP-54 cap $150 (stop $149, now in seed/config.json,
live); no CI polling; never force-push or push to main; avoid the Supabase SQL tool where a server run can answer; stop at 55% context with a handover.

## Done and LIVE (main 37b7de1, deploy 07:37)
- #818 eval measures fixed (smoke whole, choose-skill clean reads its own pick, capability-link domain_default) + LO v2 + test fix (seed-goods ceiling test runs serial).
- #819 ledger: supabase/seed/curriculum/new_lo_codes.json (ref->code, highest per band); new_los reads it; subject label follows code; 39 orphans retired
  (G2 N115; G3 N037; G4 N056-N058; K2 N165-N198) = check-first list. Live now: 446 N-rows live + 39 retired, 0 label mismatches, 278 activity links unchanged.
- #820 cap $150. #816/#817 (seed-goods fault records, school context) live too.

## Open
- PR #823 (branch cp-54-tune-runs): fixed runs skill_tune_four (tune half, 4 skills, ₹600) and skill_tune_/skill_held_ {lo,cl,pl,sl} (ceilings lo 400, cl 200, pl 160, sl 100).
  Needs full CI green, then merge, then a deploy (~35 min; never dispatch while a deploy is only queued).
- Not run locally: no pytest/Postgres in the cloud box (ruff works). CI is the proof.

## Scores so far (held half, run 44041332913, ₹586, CP-54 total ≈ ₹2,448)
gold/clean/catch/smoke: placement 1.00/.78/1.00/1.00; skill-link .85/.27/1/1; learning-objective v2 .63/.13/.86/.50; capability-link .48/.67/1/1. Bars: gold .70, clean .80, smoke .80; Nimish's target gold >= 85-90%.
Nothing switched on yet. Activity skill not yet scored (needs skill_goods probe/run first; skill_goods_probe ₹40 then skill_goods ₹450 then skill_eval_activity ₹140).

## Failure categories (held half; I saw them, so tune prompts only from TUNE runs) and the orchestrator's order of work
Orchestrator rule: if code can decide a category, fix it in code (CLAUDE.md rule 11), not in the prompt. Send categories + counts before spending the next ₹600 (done, below).
- LO: condition 'taken from a source' ~43 (approved answers add conditions the input lacks; fix: code checks the condition words against input/siblings/statements, else low confidence + assumption, never refuse; standing order 'nothing empty'); wrong signal ~20 (verb->signal default in lists.json); one action 7; fits grade 4; sibling duplicate 3 (code).
- Capability-link: default-to-domain 22 + leave-default-only-for-a-clear-reason 19 + read-the-verb 21 + one-group-one-reason ~22 + low-confidence/assumption 10: make the answer domain_default unless the objective's verb is on a verb->group list (code); the model picks only then.
- Placement: label==subject name 9, four kinds only 14, character areas 5, a part is not the subject 3, routines 3 (exact lookups, code); reason must name label+choice words 11 and never-empty 4 (format, code).
- Skill-link: nearest skill 15, doing-not-topic 13 (prompt), reason names words 13 + low-confidence/assumption when inexact 12 (code), stay in the subject 5 (shortlist filter, code).

## Next, in order
1. Code PR for the code-decidable categories above (lane: full CI; tests per behaviour; one PR). Check engine/skills/rules.py, machines.py, chain_choose.py (shortlists), lists.json per skill.
2. Merge #823 + that PR, wait for deploy. Ask the orchestrator OK before each ₹600 round.
3. Per skill under target: v3 prompt (bump `version` in SKILL.md) from TUNE failures (skill_tune_<x> run, read flow_run validate faults), up to 4 versions, each logged with score and cost in DECISIONS-LOG.md. Levers in order: better prompt, better shortlist (choose skills), Opus writer if Sonnet stalls, more school context. Then skill_held_<x>.
4. A skill holding >= 85% gold on held: switch it on (fast-lane PR: active: true in SKILL.md), then its chain: capability link for every active objective (K2, G1-G4), engine skill -> objective (155), topics. Pre-approved up to ₹1,500 in total for the chains, else ask. chain_forecast first.
5. Activity skill: skill_goods_probe -> read skill_goods_faults.activity -> fix the cause -> skill_goods -> skill_eval_activity.
6. Report after each round (scores, cost, 3 passing examples: the run log does not print them, read them from flow_run result.reply where verdict pass) and after each chain run (live counts).
