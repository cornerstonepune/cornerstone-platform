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
