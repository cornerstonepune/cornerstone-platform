-- ADR 0111: Nimish signed off the F.N 10 rubric words (docs/loop/notes/fn10-rubric-draft.md, as drafted) and shared
-- ACT-K2-M0018 and ACT-K2-0449 with K1. These rows were loaded before, and `engine load` never rewrites an activity
-- (M0-02), so a migration says it for a loaded database, as ADR 0052 did. A field is filled only while it is empty:
-- words a person wrote always stand. Safe to run twice.
-- One block, so who made the change (kept in the history) holds for these writes and no others.
do $$
declare n int; b int;
begin
  perform set_config('app.changed_by', 'Nimish (F.N 10 rubric sign-off, 24 Nov 2026)', true);
  perform set_config('app.change_reason', 'ADR 0111', true);
  with words(code, l0, l1, l2, l3) as (values
  ('ACT-K1-0973', 'does not sit with the group and does not listen to the story', 'listens to the story and says its title when asked', 'names Fati and the green snake when the educator shows the pictures', 'names the characters and tells what happened at the beginning of the story'),
  ('ACT-K1-0974', 'does not sit with the group and does not listen to the story', 'listens and recalls the title and the characters', 'answers simple questions about the story with help from the educator', 'tells what happened in the story in the right order'),
  ('ACT-K1-0975', 'does not sit with the group and does not take part', 'listens and joins in when friends retell the story', 'retells parts of the story with picture cards and help from the educator', 'retells the story in own words and says what Fati learnt'),
  ('ACT-K1-0716', 'is not concentrating in the class', 'sits & tries to pay attention to the prop', 'points to top and bottom but confuses middle', 'places and names objects at the top, middle & bottom correctly and completes the workbook page'),
  ('ACT-K1-0630', 'is unwilling to sit for the class', 'sits & listens carefully in the class', 'is able to name a few wild animals', 'is able to name wild animals and tell where they live (forest, jungle)'),
  ('ACT-K1-0631', 'is unwilling to sit for the class', 'sits & listens carefully in the class', 'is able to tell what one or two wild animals eat', 'is able to tell what wild animals eat and one thing special about each'),
  ('ACT-K1-0632', 'is unwilling to sit for the class', 'sits & listens carefully in the class', 'is able to name a few domestic animals', 'is able to name domestic animals, tell where they live, and sort wild from domestic'),
  ('ACT-K1-0633', 'is unwilling to sit for the class', 'sits & listens carefully in the class', 'is able to tell how one or two domestic animals help us', 'is able to tell how domestic animals help us (milk, wool, eggs, carrying loads)'),
  ('ACT-K1-0665', 'is unwilling to attend the class', 'tries to pay attention and listens to the song', 'sings a few words and shows some colours with actions', 'sings the song with actions and points to the colours as they are sung'),
  ('ACT-K1-0782', 'doesn''t sit for the class', 'handles the pieces and names some of the shapes', 'builds the patterns as demonstrated', 'builds new patterns through own imagination'),
  ('ACT-K1-0783', 'doesn''t sit for the class', 'smells the bottles as shown by the educator', 'matches a few pairs of bottles by smell', 'matches all the pairs and says which smells are nice and which are strong'),
  ('ACT-K1-1202', 'is not paying attention', 'holds the brush and paints a little on the branch', 'paints the branch but needs reminders to share space and colours', 'paints the branch freely with own colours and works well with friends'),
  ('ACT-K2-M0018', 'is not interested in the class', 'is able to roll the clay into balls', 'is able to make one or two shapes as shown', 'makes the carrot, chillies and apple in the right shapes'),
  ('ACT-K1-1134', 'sits in the class but doesn''t pay attention', 'pays attention but needs to be told when to use the dustbin', 'puts waste in the dustbin when reminded', 'puts waste in the dustbin on own, opens and closes the lid properly'),
  ('ACT-K1-1146', 'is unwilling to sit for the activity', 'holds the string and puts a few beads on with help', 'threads beads on own but does not follow the pattern', 'threads beads on own and follows the colour pattern shown')
  )
  update activity a set
    level_0 = case when a.level_0 = '' then w.l0 else a.level_0 end,
    level_1 = case when a.level_1 = '' then w.l1 else a.level_1 end,
    level_2 = case when a.level_2 = '' then w.l2 else a.level_2 end,
    level_3 = case when a.level_3 = '' then w.l3 else a.level_3 end,
    updated_at = now()
  from words w, tenant t
  where t.slug = 'cornerstone-pune' and a.tenant_id = t.id and a.code = w.code
    and '' in (a.level_0, a.level_1, a.level_2, a.level_3);
  get diagnostics n = row_count;
  update activity a set also_bands = array_append(a.also_bands, 'K1'), updated_at = now()
  from tenant t
  where t.slug = 'cornerstone-pune' and a.tenant_id = t.id and a.code in ('ACT-K2-M0018', 'ACT-K2-0449')
    and not 'K1' = any(a.also_bands);
  get diagnostics b = row_count;
  raise notice 'F.N 10 (ADR 0111): % activities given words, % shared with K1', n, b;
end $$;
