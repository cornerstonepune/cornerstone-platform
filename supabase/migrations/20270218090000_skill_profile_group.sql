-- ADR 0115: a G1–G4 objective counts toward the profile groups its skills reach. A skill's group is a person's
-- (Nimish's) approval of a proposal (curriculum_proposal kind 'skill_group'); nothing else writes it. An objective's
-- groups are derived, never copied: `objective_profile_group` reads the skills' groups for the bands in the setting
-- `profile.skill_bands`, and every other objective keeps its own counts_toward row (the subject default), marked
-- origin 'default'. objective_statement is not touched: its one-group index stays, and nothing is deleted.
-- Written to run twice.

create table if not exists skill_profile_group (
  tenant_id      uuid not null references tenant(id) on delete cascade,
  skill_code     text not null,
  framework_code text not null default 'CS-PROFILE' check (framework_code = 'CS-PROFILE'),
  statement_code text not null,
  source         text not null default 'person' check (source = 'person'),
  proposal_id    uuid references curriculum_proposal(id),
  staff_id       uuid not null references staff(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (tenant_id, skill_code),
  foreign key (tenant_id, skill_code) references registry_skill (tenant_id, code) on delete cascade,
  foreign key (tenant_id, framework_code, statement_code) references framework_statement (tenant_id, framework_code, code)
);
create index if not exists skill_profile_group_statement_idx on skill_profile_group (tenant_id, statement_code);
comment on table skill_profile_group is 'ADR 0115: the one capability-profile group a registry skill is evidence of, as a person approved it (the proposal it came from, the staff member who approved). Objectives of the bands in profile.skill_bands count toward the groups of their skills (view objective_profile_group).';

-- An objective's profile groups. origin 'skill': the group one or more of its skills reach (`skills` names them), for an
-- objective of a band in profile.skill_bands with at least one skill whose group is approved. origin 'default': the
-- objective's own counts_toward row, for every other objective (no skill yet, no skill approved yet, or another band).
create or replace view objective_profile_group with (security_invoker = true) as
with scoped as (
  select lo.tenant_id, lo.code
  from learning_objective lo
  join config c on c.tenant_id = lo.tenant_id and c.key = 'profile.skill_bands'
  where lo.band in (select jsonb_array_elements_text(c.value))
),
from_skills as (
  select los.tenant_id, los.lo_code, spg.statement_code as group_code,
         array_agg(los.skill_code order by los.skill_code) as skills
  from learning_objective_skill los
  join scoped s on s.tenant_id = los.tenant_id and s.code = los.lo_code
  join skill_profile_group spg on spg.tenant_id = los.tenant_id and spg.skill_code = los.skill_code
  group by los.tenant_id, los.lo_code, spg.statement_code
)
select f.tenant_id, f.lo_code, f.group_code, 'skill'::text as origin, 'person'::text as source, f.skills
from from_skills f
union all
select os.tenant_id, os.lo_code, os.statement_code, 'default'::text, os.source, '{}'::text[]
from objective_statement os
where os.framework_code = 'CS-PROFILE' and os.relation = 'counts_toward'
  -- a person's own group is always kept beside its skills' (ADR 0115: derived data never overrides a person's edit)
  and (os.source = 'person'
       or not exists (select 1 from from_skills f where f.tenant_id = os.tenant_id and f.lo_code = os.lo_code));
comment on view objective_profile_group is 'ADR 0115: each objective''s capability-profile groups, derived: from its skills'' approved groups (origin skill) or, failing that, its own counts_toward row (origin default).';

-- the one proposal list gains its word, added to the list as it stands (as CP-48 did)
do $$
declare
  d text;
begin
  d := pg_get_constraintdef((select oid from pg_constraint
                             where conrelid = 'curriculum_proposal'::regclass and conname = 'curriculum_proposal_kind_check'));
  if position('ARRAY[' in d) = 0 then
    raise exception 'ADR 0115: curriculum_proposal_kind_check is not a list: %', d;
  end if;
  if position(quote_literal('skill_group') in d) = 0 then
    d := regexp_replace(d, 'ARRAY\[', format('ARRAY[%L::text, ', 'skill_group'));
    alter table curriculum_proposal drop constraint curriculum_proposal_kind_check;
    execute format('alter table curriculum_proposal add constraint curriculum_proposal_kind_check %s', d);
  end if;
end $$;

do $$
begin
  if exists (select from pg_roles where rolname = 'app_engine') then
    grant select, insert, update, delete on skill_profile_group to app_engine;
    grant select on objective_profile_group to app_engine;
  end if;
  if exists (select from pg_roles where rolname = 'app_web') then
    grant select on objective_profile_group to app_web;
  end if;
end $$;

insert into access_table (schema_name, table_name, kind_code, key_column, key_type, data_class, reason) values
  ('public', 'skill_profile_group', null, null, null, 'school_wide', 'each registry skill''s approved profile group; no child')
on conflict (schema_name, table_name) do update set kind_code = excluded.kind_code, key_column = excluded.key_column,
  key_type = excluded.key_type, data_class = excluded.data_class, reason = excluded.reason;

select internal.apply_conventions();
