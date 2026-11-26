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
 'skills', (select json_agg(json_build_array(code, name, coalesce(domain_name,domain,''), coalesce(strand,''), coalesce(skill_type,''))) from registry_skill)
) as d
```
Result on 26 Nov: 2,593 live objectives, 2,753 objective→skill links, 244 skills, every link resolves.

## Findings to lead the page with (bad news first)
- 527 live objectives count toward no group, so they reach none of capable/kind/unafraid: all are kind `character` (411) or `routine` (116).
- K1 has no objectives or activities in the database (grades with objectives: K2, G1–G4).
- Language and reading alone holds 952 objectives; number and measure 421.

## Next step
Build one self-contained HTML (data inlined): headline findings; a mind map Words → Capabilities → Groups → Grades →
Objectives (collapsible, counts on every node); a table with filters for grade, subject, word, capability, group, kind,
signal, skill, "no group" and text search. Load the artifact-design skill first; publish with the Artifact tool.
