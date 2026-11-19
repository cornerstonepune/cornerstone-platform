-- CP-81 (#900, Money history): the school's expense sheet (1,301 lines since Nov 2021) fills the claim table as history. A line keeps its sub-category (the
-- sheet's cost stream), its event, its flags (capex, advance, late, urgent), the kind of bill and the bill file's title, and its id in the sheet, so a second
-- run changes nothing. A line from before the portal is `historic`: in no queue, and a line the sheet gives no single campus (Both, Event, nothing) has none.
alter table expense
  add column subcategory text check (subcategory is null or btrim(subcategory) <> ''),
  add column event text check (event is null or btrim(event) <> ''),
  add column tags text[] not null default '{}',
  add column bill_quality text check (bill_quality in ('vendor_bill', 'payment_proof', 'none')),
  add column bill_ref text,
  add column source_ref text;
create unique index if not exists expense_source_ref_idx on expense (tenant_id, source_ref) where source_ref is not null;
alter table expense alter column campus_id drop not null;
alter table expense add constraint expense_campus_check check (campus_id is not null or status = 'historic');
alter table expense drop constraint expense_status_check;
alter table expense add constraint expense_status_check check (status in ('submitted', 'withdrawn', 'voided', 'historic'));
-- the sheet holds refunds and adjustments as negative lines: only history may be negative, and never nothing
alter table expense drop constraint expense_amount_check;
alter table expense add constraint expense_amount_check check (amount > 0 or (status = 'historic' and amount <> 0));
comment on column expense.subcategory is 'The kind of regular expense within the category (the sheet''s cost stream): a stream may sit under several categories (CP-81).';
comment on column expense.source_ref is 'The line''s id in the school''s expense sheet, for a historic line: what makes the import safe to run twice.';

-- The school's own categories, from the sheet; replaces the first guess only where no one has changed it.
update config set value = '["Advances & adjustments", "Books, kits & curriculum", "Events & celebrations", "Furniture, equipment & IT (capex)", "Housekeeping & hygiene", "Local transport & logistics", "Marketing & admissions", "Printing & copying", "Repairs & maintenance", "Staff payments & uniforms", "Staff welfare & hospitality", "Stationery & art supplies", "Teaching & activity materials (TLM)", "Utilities & services", "Other / unclear"]'::jsonb, updated_at = now()
where key = 'money.categories' and value = '["Water", "Garbage", "Tea and refreshments", "Pest control", "RO service", "Printing", "Materials", "Repairs", "Utilities", "Housekeeping", "Events", "Other"]'::jsonb;
insert into config (tenant_id, key, value, description)
select id, 'money.subcategories', '{"Books, kits & curriculum": ["Cambridge / books"], "Events & celebrations": ["Didi inter-campus auto", "Porter", "Staff celebrations"], "Furniture, equipment & IT (capex)": ["Electrician", "Porter"], "Housekeeping & hygiene": ["D-Mart / wholesale restock", "Pest & mosquito control"], "Local transport & logistics": ["Didi inter-campus auto", "Porter"], "Printing & copying": ["Print vendor / copier", "Printer upkeep"], "Repairs & maintenance": ["Electrician", "Painter", "Pest & mosquito control", "Plumber"], "Staff welfare & hospitality": ["Daily tea (Neev)", "Staff celebrations"], "Stationery & art supplies": ["Annual stationery buy", "D-Mart / wholesale restock"], "Utilities & services": ["Garbage collection", "Pest & mosquito control", "RO / water filter", "Water tanker"]}'::jsonb, 'CP-81: the regular expenses a category offers on the claim form, from the school''s expense sheet (a stream is listed under a category where it occurs at least three times). A claim may name one of them.' from tenant
on conflict (tenant_id, key) do nothing;
insert into config (tenant_id, key, value, description)
select id, 'money.events', '["Annual day / Samaaroh", "Christmas", "Diwali Mela / Re-wali Diwali", "Early Years Fest", "Festivals (other)", "Field visits", "Graduation / Year end", "Grandparents Day", "Night Stay", "Orientation / Back to school", "Sports Day", "Summer Camp"]'::jsonb, 'CP-81: the school''s events, from its expense sheet; a claim may name one.' from tenant
on conflict (tenant_id, key) do nothing;
