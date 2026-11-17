-- CP-70 (#837, specs/CP-70/spec.md): an objective can sit in more than one grade, an activity can be tagged to more than one.
-- No new table (docs/data-model.md): `band` stays the home grade and `also_bands` holds the others, as data on the row. A grade is a
-- short code, and the tree reads a grade's objectives in one query (`band = g or g = any(also_bands)`), so a link table would only
-- add a join to the read CP-72 made fast. Removing a grade is an update of this column; nothing is deleted.
-- History is the one log: `change_kept` already writes `change_log` for these tables, but it watched neither the grade nor the
-- subject code (what the tree reads), so an edit of either left no trace and could not be undone. It watches them from here on.

alter table learning_objective add column also_bands text[] not null default '{}';
alter table learning_objective add constraint learning_objective_also_bands_not_home
  check (band is null or not (band = any (also_bands)));
create index learning_objective_also_bands_idx on learning_objective using gin (also_bands);
comment on column learning_objective.also_bands is
  'The other grades this objective sits in besides its home grade `band` (CP-70). Edited by a coordinator through the engine; every change is a change_log row.';

alter table activity add column also_bands text[] not null default '{}';
alter table activity add constraint activity_also_bands_not_home
  check (band is null or not (band = any (also_bands)));
create index activity_also_bands_idx on activity using gin (also_bands);
comment on column activity.also_bands is
  'The other grades this activity is tagged to besides its own `band` (CP-70). Edited by a coordinator through the engine; every change is a change_log row.';

drop trigger learning_objective_change_kept on learning_objective;
create trigger learning_objective_change_kept after update on learning_objective
  for each row execute function internal.change_kept('code', 'subject', 'subject_code', 'unit', 'title', 'band', 'also_bands');

drop trigger activity_change_kept on activity;
create trigger activity_change_kept after insert or update on activity
  for each row execute function internal.change_kept('code', 'strand', 'name', 'objective', 'materials', 'level_0', 'level_1',
    'level_2', 'level_3', 'sheet_no', 'steps', 'thinking', 'band', 'also_bands');
