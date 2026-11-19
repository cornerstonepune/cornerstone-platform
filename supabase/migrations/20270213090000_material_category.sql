-- CP-84: one list of materials, with categories. An item of the catalogue says which of the school's categories it files under, so a purchase of it files
-- under its money category and budget with no re-typing. One column on the item, no new table. The category is one of the words of the setting
-- `money.categories`; the engine checks that (a list that is a setting cannot be a database constraint), and an item with none is "needs a category".
-- ADDITIVE ONLY, and written to run twice.
alter table material_item add column if not exists category text;
comment on column material_item.category is 'CP-84: the school''s category of this item, one of the setting money.categories (checked in the engine, not here); null reads "needs a category". A person''s change is a row of change_log.';
