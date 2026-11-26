# Mapping explorer (Nimish, 26 Nov): one HTML page, mind map + filterable table

Ask: "an html that shows the whole mapping around grades, learning objectives, skills, the capable kind unafraid mapping
in a proper mind map and a strong tabular view with right filters". A read-only report, not product code: publish as an
Artifact, nothing in apps/web.

## Where the mapping lives (live DB, cornerstone-cloud)
- Grades: `grade` (code, name, ord). Objectives: `learning_objective` (not `retired`), band = grade.
- Objective → profile group: `objective_statement` relation `counts_toward`, framework `CS-PROFILE`, `statement_code` = group code `v2-<capability>.<group>`.
- Groups, their Foundational/Preparatory "I can" lines and their words (capable / kind / unafraid): `supabase/seed/profile.json` (same as `framework_statement` CS-PROFILE).
- Objective → skill: `learning_objective_skill`; skills are `registry_skill` (code, name, domain_name, strand, skill_type), not `skill`.
- Activities per objective: `activity_objective`.

## Pull (Supabase connector `execute_sql`, project ruznbyngtfjsaymuylhm; the output is saved to a file, parse it with python)
```sql
select json_build_object(
 'los', (select json_agg(json_build_array(lo.code, lo.band, coalesce(lo.subject_code,''), lo.unit, coalesce(t.name,''), lo.title, lo.signal, coalesce(lo.kind,''), coalesce(os.statement_code,''), coalesce(a.n,0), coalesce(lo.confidence,'')) order by lo.band, lo.ord nulls last, lo.code)
   from learning_objective lo
   left join topic t on t.tenant_id=lo.tenant_id and t.code=lo.topic_code
   left join objective_statement os on os.tenant_id=lo.tenant_id and os.lo_code=lo.code and os.relation='counts_toward' and os.framework_code='CS-PROFILE'
   left join (select lo_code, count(*) n from activity_objective group by 1) a on a.lo_code=lo.code
   where not lo.retired),
 'links', (select json_agg(json_build_array(lo_code, skill_code)) from learning_objective_skill x where exists (select 1 from learning_objective l where l.code=x.lo_code and not l.retired)),
 'skills', (select json_agg(json_build_array(code, name, coalesce(domain_name,domain,''), coalesce(strand,''), coalesce(skill_type,''))) from registry_skill),
 'grades', (select json_agg(json_build_array(code, name, ord) order by ord) from grade)
) as d
```
Result on 26 Nov: 2,593 live objectives, 2,753 objective→skill links, 244 skills, every link resolves.

## Findings to lead the page with (bad news first)
- 527 live objectives count toward no group, so they reach none of capable/kind/unafraid: all are kind `character` (411) or `routine` (116).
- K1 has no objectives or activities in the database (grades with objectives: K2, G1–G4).
- Language and reading alone holds 952 objectives; number and measure 421.

## More findings (26 Nov, session 2)
- No objective reaches "kind": all 7 kind groups are empty. 16 of 24 groups have no objectives.
- All Science (177) and Global perspectives (110) objectives count toward "Changing my mind" (reasoning); "How the world works" gets 34. Looks mis-mapped (e.g. "names a habitat"). Flag to Nimish, don't fix silently.
- 447 objectives have no skill; 890 have no activity. Topic name is empty for every objective (unit used instead).

## State: page written, NOT checked, NOT published
Source: `mapping-explorer/mapping-explorer.html` (d3 7.8.5 mind map, word x grade grid, findings computed in JS, filterable/sortable table, row detail, Copy as CSV) + `build.py`.
To finish: run the query above, save the `d` object as `mapping-explorer/raw.json` (keep it out of git), `python3 build.py` -> `data.json` + `preview.html` (data inlined). Open preview.html once in the browser pane (one look: mind map labels/links, grid, table filters), fix what it shows, then publish `mapping-explorer.html` with the Artifact tool, `files: {"data.json": ...}`, icon "map". Put the URL here and in HANDOFF.

## Nimish, 26 Nov (later): find every issue of this kind and correct it through the loop
Ask (dictated): "identify all these kind of issues and run a complete loop so that for each one there is a prompt that
helps the system identify the issues and correct them. Ensure kind is also linked, so capable, kind and unafraid are mapped right."

Issue classes found so far (each needs a deterministic check in code first; the counts come from the data, never from a model):
1. Objective reaches no group: 527 (character 411, routine 116). These are the natural home for kind and unafraid.
2. Group with no objectives: 16 of 24. Word with no objectives: kind (all 7 kind groups empty).
3. Mapping that looks wrong: all SCI (177) + GP (110) -> "Changing my mind"; "How the world works" has 34.
4. Grade with no objectives: K1 (the pilot grade); also PG, N, G5-G10.
5. Objective with no skill: 447. Objective with no activity: 890.
6. topic_code resolves to no topic name for every objective.

Proposed shape (planner to confirm against the code and ADRs):
- `engine` check per class: a pure function that lists offenders with a reason (assess/ or core/, no I/O in assess/).
- Where fixing needs judgment (1-3, and maybe 5): a seeded, versioned prompt per purpose (e.g. `profile-map`), scored by
  `engine eval <purpose>` against a small hand-checked gold set before it goes live. The model only proposes
  group + reason; it never writes the mapping.
- Proposals land in a review queue (check whether the library page's existing Proposals/decideProposal flow fits);
  an approved proposal writes a new objective_statement row. Nothing is auto-applied.
  Why not auto-correct: a wrong mapping changes every child's profile report that parents read.
- One command re-runs every check and reports counts per class, so "fixed" is a number that went to 0.
- Things a model can't fix: K1 objectives (needs the school's K1 curriculum) and missing topics (data). Those go to Nimish.

Open questions for Nimish (ask before ticketing):
a. Who approves proposed mappings: Nimish, the head of academics, or educators per subject?
b. May an objective count toward more than one group? Today each counts toward at most one, but most groups carry two words.
c. Is SCI/GP -> "Changing my mind" deliberate (ADR?) or a mistake?
d. Where do K1 objectives come from?

## Nimish, 26 Nov (later still): how he wants it solved — "learn from the good, fix the gaps", with Opus
Dictated: use Opus (`claude-opus-5-5`) through the Claude API. For each mapping stage, have the model study the mappings that
look right, work out the pattern (why an objective belongs to a group, how it is worded), write that pattern up as a prompt,
then use that prompt to correct the gaps. Not yet an ADR: he was asked "go with this approach?" and had not answered when
the session hit its context budget.

Coordinator's proposed fit with the repo rules (told to Nimish):
1. Bad news: there is nothing to learn from for kind (0 objectives) or 15 other groups, and the SCI/GP mappings may be
   wrong, so "looks right" can't be read off the data. A human marks a small gold set first (~5 per group, kind included),
   plus each group's own "I can" lines in supabase/seed/profile.json as the definition.
2. Prompt-writer step (Opus, run once, offline): reads gold examples + group definitions, drafts the mapping guide prompt.
   The draft is saved as a seeded, versioned prompt row (purpose e.g. `profile-map`), never a string in code.
3. `engine eval profile-map` scores the draft on held-out gold examples it never saw; it goes active only above the bar.
4. The active prompt runs over the gaps (527 unmapped; SCI/GP as "second opinion") and PROPOSES group + reason. Never writes.
5. Review queue; approval writes a new objective_statement row. One check command shows counts per class falling.
Classes 4 (K1 empty) and 6 (topic names) are data, not model work. Class 5 (no skill) could be a second purpose later.
### Survey result (helper subagent, code read by hand, nothing run against live data)
- THE JOB ALREADY EXISTS: CHOOSE skill `capability-link` (`w1_bank/chain_choose.py`; `supabase/seed/skills/capability-link/`
  has SKILL.md, contract.json, gold.json, gold_coordinators.json, planted_bad_gold.json, lists.json). Improve it, don't build a new one.
  Code shortlists groups via the objective's registry skills (`chain_draft.capability`); `rules_choose.capability_first`
  (skills/rules_choose.py L116) answers academic objectives by code while lists.json says `"academic":"default"`; else the
  model picks and `capability_after` (L141) keeps it only if the reason names the verb and the group's words.
- SCI/GP -> "Changing my mind" is DELIBERATE CONFIG, not a bug: `lo.capability_default` (supabase/seed/config.json L165),
  one group per subject; reasoning in docs/notes/CP-54-cl-default.md L67. No ADR. (Answers open question c: by design, but crude.)
- Why 527 character/routine are unmapped and kind is empty: NOT traced yet (probably empty shortlist or no subject default).
- One group per objective is a SCHEMA rule: unique partial index `objective_statement_one_capability`
  (migration 20270129090000_cp54_frameworks.sql L84). More than one group (question b) = migration + ADR.
- Writes are update-in-place (delete machine row, insert `source='machine'`); `source='person'` rows are never overwritten
  by the machine. Confidence/reason go only to the run record (`flow_run`), no column.
- Review queue fits: `curriculum_proposal` table + `decideProposal` (library/actions.ts L61) -> `POST /bank/proposal/{id}/decide`
  (`w1_bank/learn.py` L88). Needs a new `VERDICTS` kind (e.g. `profile_group`), a handler that replaces the
  objective_statement row with `source='person'`, a Kind in `apps/web/lib/decides.ts`, a card in proposals.tsx.
- Closest propose-for-review pattern: `curriculum_map` (propose + validate prompts, `w1_bank/map_agents.py`, `cli_map.py`).
- Prompts: table `prompt` (purpose, version, text, model, json_schema, active, effort; one active per purpose);
  seeds `supabase/seed/prompts/<purpose>.v<N>.txt`. `engine eval <purpose>` = cli.py L210; bars are `threshold` rows
  `eval.<purpose>.<measure>`, `checks.evals.held` exits 1 below a bar. Activation command not found yet.
- Counts home: `engine curriculum counts` (w1_bank/cli_counts.py) — add a per-issue-class section. n-of-n view stays in
  `engine/checks/chain_layers.py`.
- Who approves: only a coordinator edits curriculum today (curriculum_edit.py L56); "who decides each kind" is config.json L16-31.
- No ADR covers the profile mapping; next free number 0113.

## Nimish, 26 Nov (last): scope G1-G4, and map through skills
Dictated: do G1 to G4 only. His understanding of the agreed backend: objective -> skill (~230 registry skills) -> capable/kind/unafraid.
So the job should be one mapping of each SKILL's wording to a group; behavioural skills land in kind. "What am I missing?"
Coordinator's answer (to verify next session, nothing checked against live data):
- The profile report reads objective -> group directly (`objective_statement counts_toward`); skills only SHORTLIST groups
  for the `capability-link` step. Find the skill -> group table (`chain_draft.capability`) and how full it is.
- 447 objectives have no skill; check how many are G1-G4 and whether they are the 527 character/routine ones. Those reach
  nothing through skills until they get a skill.
- An objective with several skills could reach several groups; the unique index allows one. Decide: derive groups through
  skills (no per-objective row) or keep one primary.
- kind/capable/unafraid are words on the 24 groups, not groups; a behavioural skill maps to one of the 7 groups carrying kind.
Proposed: review ~244 skill rows (Opus proposes group + reason, a person approves) instead of 2,593 objectives. Needs his yes + ADR 0113.

## Verified, 26 Nov (session 5, live data read-only + `chain_draft._capability_of_skill`)
- G1–G4: 1,666 live objectives. 1,569 academic all count toward a group (all `source='machine'`, 0 by a person);
  97 routine + 1 character count toward none. The 411 character objectives are K2, outside this scope.
- Those 1,569 rows use 7 of 24 groups: language-and-reading 556, number-and-measure 402, change-my-mind 259,
  imagine-and-express 123, design-and-build 117, use-tools-well 88, how-the-world-works 24. Kind: 0.
- The skill → profile link today is the spine (`docs/spine/spine.json`), and it stops at the 8 CAPABILITIES, not the
  24 groups. G1–G4 objectives use 123 of the 244 registry skills; all 123 reach a capability, 40 reach two or more.
  Skills by capability: academic mastery 69, communication & collaboration 40 (holds 2 kind groups), reasoning 21,
  making 10, technology 8, self & others 7, society & planet 6, learning & agency 2.
- Through skills, 816 of the 1,385 skill-linked objectives reach one capability and 569 reach two or more, so
  "one group per objective" (unique index) vs "every group its skills reach" is a real choice.
- 281 G1–G4 objectives have no skill (272 academic that hold a machine group today, 9 routine).
- ADR number: 0113 is taken by PR #952 (K1 pilot offers); this decision moves to 0114.
