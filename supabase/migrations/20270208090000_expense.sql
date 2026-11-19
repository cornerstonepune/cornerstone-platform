-- CP-78 (#895, Money MM-2a): a claim. One row per claim, many per person; its history is change_log, its approvals will be `approval` rows
-- (MM-3), its categories a setting. Never deleted: a claim is withdrawn by its claimant or voided with a reason.
create table if not exists expense (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  campus_id   uuid not null references campus(id),
  claimant_id uuid not null references staff(id),
  spent_on    date not null,
  amount      numeric(12, 2) not null check (amount > 0),
  vendor      text not null check (btrim(vendor) <> ''),
  category    text not null check (btrim(category) <> ''),
  note        text,
  receipt_key text,
  rule_version integer not null check (rule_version >= 1),
  status      text not null default 'submitted' check (status in ('submitted', 'withdrawn', 'voided')),
  reason      text check (reason is null or btrim(reason) <> ''),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (status <> 'voided' or reason is not null)
);
create index if not exists expense_claimant_idx on expense (claimant_id, created_at desc);
comment on table expense is 'A money claim (CP-78): amount, date, vendor, category, campus, the bill''s private key, and the version of the money rules it pinned. Never deleted.';

drop trigger if exists expense_never_deleted on expense;
create trigger expense_never_deleted before delete on expense for each statement execute function internal.forbid_delete();
drop trigger if exists expense_change_kept on expense;
create trigger expense_change_kept after insert or update on expense
  for each row execute function internal.change_kept('id', 'amount', 'spent_on', 'vendor', 'category', 'status', 'reason');

do $$
begin
  if exists (select from pg_roles where rolname = 'app_engine') then
    grant select, insert, update on expense to app_engine;
  end if;
end $$;

insert into access_table (schema_name, table_name, kind_code, key_column, key_type, data_class, reason) values
  ('public', 'expense', null, null, null, 'school_wide', 'money claims: each person sees their own through the engine, never the table')
on conflict (schema_name, table_name) do update set kind_code = excluded.kind_code, key_column = excluded.key_column,
  key_type = excluded.key_type, data_class = excluded.data_class, reason = excluded.reason;

select internal.apply_conventions();
