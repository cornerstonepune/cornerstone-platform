# CP-54 handover: backend finisher (17 Nov 2026, ~05:45 UTC)

Read first: docs/notes/standing-orders.md, CLAUDE.md, docs/notes/CP-54-skill-pool.md (on PR #818's branch), this note.
Nimish (17 Nov): quality over cost; API credits only (server runs), never the Claude plan; no partial work. Target now: gold >= 85-90% on
every skill on the HELD half, tune only on the TUNE half; up to 4 prompt versions a skill, each logged with score and cost in DECISIONS-LOG.md;
switch a skill on as soon as it holds >= 85% and run its chain. CP-54 cap raised to $150 (stop $149): NOT yet recorded in config `llm.campaigns`.

## Merged and live (main 8bc713d deployed 03:15 by deploy run 588; later merges below need their own deploy)
- #812 CI data lane: seed/DECISIONS-LOG/CLAUDE.md-only PRs run bin/check + one runner (~4 min). Proven on #817.
- #814 pool: eval / seed-goods / chain-link calls run 10 at once (`skill.workers`), spend ceiling reserves in-flight calls. Live (8bc713d).
- #816 seed-goods records refusal faults (`skill_goods_faults.<name>`), skill_goods ceiling ₹450, run `skill_goods_probe` (₹40). Merged 03:59, main 5296c49; NOT deployed yet.
- #817 school.context = Nimish's text (at most 25 children, five things). Merged 03:59; NOT deployed yet.

## Open
- **#818** (branch cp-54-eval-clean, head 84cf01c): eval measures fixed at the cause + learning-objective v2 + skill_eval_four ₹600.
  CI was green on bdd6a29; 84cf01c added capability-link domain_default + LO v2 + ₹600. **mergeable_state: dirty (conflict with main after #816/#817:
  likely .github/curriculum/command.py and docs/notes/CP-54-skill-pool.md).** Merge main into the branch (never rebase), re-run lane/full CI, merge.
  Then main CI (~25 min) and the deploy carry #816+#817+#818 together.

## Runs so far (flow_run; all on API credits)
- skill_goods (serial build, run 44001165753): 30 min, stopped at ₹343: kept 15/58, refused 20, 23 not started. Do not rerun blind: run
  `skill_goods_probe` first after the deploy, read `skill_goods_faults.activity`, fix the cause, then `skill_goods` (₹450).
- skill_eval_four (pool build, run 44008879207): 4 min 35 s, ~₹609. Scores (held) gold/clean/catch/smoke: LO .60/.10/.94/0, capability-link
  .516/0/1.0/0, placement 1.0/0/1.0/0, skill-link .692/0/1.0/0. Smoke 0 and choose-skill clean 0 were HARNESS faults (fixed in #818);
  capability-link validator failed on empty domain_default (fixed in #818 data). These scores are not the skills' real scores: re-run after #818 deploys.
- CP-54 spend so far ≈ ₹1,860 (≈$21). Ceilings: skill_eval_four ₹600 (after #818), skill_eval_activity ₹140, skill_goods ₹450, probe ₹40.

## Next, in order (one run at a time; never dispatch while a deploy is only queued: a newer pending replaces it)
1. Resolve #818 conflict, CI green, merge; wait for main CI + deploy ('start the engine' + settings success).
2. Record the $150 cap in `llm.campaigns` (cp-54) via a lane PR.
3. skill_eval_four -> scores; read validator faults from flow_run (Supabase MCP `execute_sql`, project ruznbyngtfjsaymuylhm, read-only).
   For each skill below 85% gold: new prompt version from the faults (tune half only), bump `version` in SKILL.md, re-score held, log in DECISIONS-LOG.md.
   Choose skills: better code shortlist, writer on Opus if Sonnet stalls.
4. skill_goods_probe -> faults -> fix -> skill_goods -> skill_eval_activity.
5. Switch-on PR per skill at >= 85% (lane), then its chain run (chain_forecast first; pre-approved under ₹1,200 total, else ask).

## Subject codes / new objectives (approved by orchestrator; NOT yet built): branch cp-54-lo-ledger is empty, start from main
Findings (live, read-only, 17 Nov 04:30):
- The 107 GP->ART and 21 VA->GP mismatches are batch-1 `by_unit` rulings: leave them.
- 485 machine-made new objectives LO-<band>-N###. Codes are POSITIONAL (`seed_rows.new_los`: N001.. by file order). Today all 446 refs in
  the files sit on codes whose live title matches (verified 446/446), and all 278 activity_objective links on N-codes equal what the files say
  (verified 278/278, none stale). Damage: 116 rows whose `subject` label disagrees with `subject_code` (the code is right; `_new_lo`'s update
  path never updates `subject`); 39 orphan N-rows (codes beyond today's refs, e.g. K2 had 198 new_los, now 164), live, not retired, no links.
- Churn: every deploy `engine load --settings` runs subject_map.apply (code from stale label) then apply-seed (code back from files):
  flow_run 'curriculum.apply-seed' 03:17 changed 103 lo_titles.
Fix (one PR): (1) `supabase/seed/curriculum/new_lo_codes.json` {grade: {ref: code}} built from today's mapping (verified above), plus each
grade's highest number ever used (orphans included) so a new ref never reuses a number; `new_los` reads codes from it; a ref with no code is a
fault naming the file to update; test: reordering/removing entries in a file never changes an existing code; test: every ref has a ledger code.
(2) `_new_lo` sets `subject` = the subject's name on insert AND update (the code is the one truth). (3) retire the 39 orphans (machine-made,
no links) and list them on the coordinators' check-first list. (4) Report counts after the deploy: labels fixed, orphans retired, links unchanged.
Also look for the same two patterns elsewhere (identity by position, one fact stored twice) and report.
