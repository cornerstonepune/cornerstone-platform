-- CP-39 (#710): a lesson holds its activity. Today a lesson reaches an activity only through a plan line's text matched by
-- name (11% of K2 plan lines in fortnights 10 to 17 link). The coordinator now chooses the activity on the lesson itself, from
-- the activities of the lesson's head (the setting `timetable.heads`, never stored on the activity); the lesson keeps it when it
-- moves. One column and its link, no data written, no table and no function added.
alter table session add column if not exists activity_code text;

do $$ begin
  if not exists (select from pg_constraint where conname = 'session_activity_code_fkey') then
    alter table session add constraint session_activity_code_fkey
      foreign key (tenant_id, activity_code) references activity (tenant_id, code);
  end if;
end $$;

create index if not exists session_activity_code_idx on session (tenant_id, activity_code) where activity_code is not null;

comment on column session.activity_code is 'The activity this lesson holds, chosen by the coordinator from the activities of its head (CP-39); null: none chosen. The plan line''s activity (plan_entry.activity_id) is shown when this is null.';
