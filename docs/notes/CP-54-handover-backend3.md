# CP-54 handover: backend finisher, session 3 (17 Nov 2026, ~10:00 UTC)

Read first: docs/notes/standing-orders.md, CLAUDE.md, this note. Orchestrator: session_01KEBF26AbSER2xbWPJjbrmX (send_message, one per gate).
Rules unchanged: API credits only, every model run on the server (curriculum-run workflow, one run at a time, group engine-server: a newer
dispatch replaces a WAITING one; never dispatch while another is waiting); the Supabase tool is SELECT only; stop at 55% context.
After any SKILL.md / lists.json / config change is deployed, dispatch `load_settings` (no spend) BEFORE the eval, or the old prompt rows run.

## Done and LIVE
- #823 tune/held fixed runs; #826 code rules for LO, CL, PL, SL (main f319b84, deployed). LO SKILL v3, CL v2.
- #828 subject educators: `educator.timetable_roles` live = [class_teacher, cover_educator, subject_educator] (read 09:51);
  day view + materials list + reminder filtered to the grant's subject (deployed 8d40771).
- load_settings ran 09:30 and 09:48 (95 prompt rows).

## skill_tune_four (run 44057035731, TUNE half, actual Rs 522.67: LO 266.25, CL 85.47, PL 90.46, SL 80.49; Opus validator = 92%)
gold/clean/catch: LO .967/.50/.64 · CL .552/.75/1.0 (left default 4, right 0) · PL 1.00/.76/1.0 · SL .684/.538/1.0.
CP-54 total about Rs 2,971 + held_pl (about Rs 95, run at 09:53, scores not yet read) against cap $150.

Failure categories (tune only) and who fixes them:
- CL gold: 9 misses = wrong subject->default MAP (`lo.capability_default` config): Science and Social Studies gold is reasoning.*, Home Science
  society-and-planet; Visual Arts default resolves to choices-and-consequences (suspect). 4 = model leaving default wrongly. Clean: 3 headings missed
  by rules_choose.verb() ("Introduction to…", "Reinforces concepts /", "Reflective symmetry"); rest low/assumption format.
- PL clean (code): exactness test lacks aliases (FMS vs Fine motor skills, GMS, Rhymes & Songs) so right picks are marked low; one shared word
  counted exact (Science & Geo); placement_first reason says "a character" (uses code prefix) instead of "character area".
- SL: NOT a regression from the subject filter (replayed: every gold survives). Gold: 4 double picks with one off-gold (code: one pick);
  2 wrong single picks (prompt). Clean: 4 "medium" while saying inexact (code: low when inexact/assumption); 2 high with empty assumption (prompt).
- LO clean 14 = validator's "one signal, the right one" derives signal from the verb; the school's signals are not verb-determined -> relax the
  VALIDATOR rule (gold already checks signal). fits-grade 2, siblings 2 (validator prompt). 1 gold miss (writer prompt).

## Open
- PR #831 (cp-54-cl-default, /home/user/wt-cl-default): academic objectives take the subject default by code (lists.json "academic": "default"),
  routines asked as kind routine, blank-title objectives now covered, forecast counts code answers as 0 calls. The agent was told (after it reported)
  to also CORRECT the subject->default map from tune gold with a test, and fix verb() headings; check its new commits before merging.
  Open decisions for the orchestrator: (1) 407 academic objectives (Science 174, Home Science 121, GP 84, Visual Arts 28) still go to the model
  (about Rs 71) because their default is not on their shortlist; with a corrected map most should land on the list; (2) every default answer is
  low confidence, so the check-first list (chain_disagreements.capability) would list about 1,224 rows; decide whether code defaults belong there.
  Do NOT run the capability_link fill until the map is corrected, #831 is merged, deployed and load_settings has run. Then chain_forecast, then
  capability_link, then report live counts.

## Next, in order
1. Read held_pl scores (run after 09:53). Placement held gold >= .85 -> switch on (active: true, small PR) and its chain. Clean < .80 -> send the
   clean faults: all known ones are the code faults above.
2. One code PR: PL exactness/aliases + reason wording; SL one-pick + low-when-inexact; (CL bits are in #831).
3. v3 prompts (version bump, DECISIONS-LOG.md row with score and cost): LO VALIDATOR (signal rule, fits-grade, siblings); SL writer (doing not
   word; high needs an assumption or exact match). Orchestrator holds held_lo (about Rs 266) until the LO validator is fixed: ask before running it.
4. Then skill_tune_sl / skill_held_sl, skill_held_lo. Switch on at held gold >= .85; chains within the Rs 1,500 pre-approval; live counts after each.
