-- CP-85: materials that are alternatives ("pencils or crayons"). The activity notes say "Puppets or flashcards": either will do, and the split used to make both
-- needed. Items of one activity that carry the same `alt_group` are alternatives; the class list makes one line for the group. One nullable column on the
-- activity's link to its items, no new table. An item that is no one's alternative has none, which is every row there is today.
-- ADDITIVE ONLY, and written to run twice.
alter table activity_material add column if not exists alt_group integer check (alt_group >= 1);
comment on column activity_material.alt_group is 'CP-85: items of one activity with the same number are alternatives (either will do); null is needed on its own. The first by ord is the one the class list shows, with the others named on it.';
