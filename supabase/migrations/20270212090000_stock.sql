-- CP-82 (Money & Materials MM-9): what each campus holds. One ledger of moves, append-only like evidence_event: stock in, handed out, counted, written
-- off, and the minimum a campus wants to keep (the newest minimum wins). What is on hand is never stored: it is the view `stock_level`, the last count
-- plus the moves after it. A correction is a new move; nothing edits or deletes one. The campus is the store (one per campus), the catalogue
-- (`material_item`) is the item list, the tolerance and the words for a reason are settings (`stock.*`).
create table if not exists stock_move (
  id            uuid primary key default gen_random_uuid(),
  seq           bigint generated always as identity unique,
  tenant_id     uuid not null references tenant(id) on delete cascade,
  campus_id     uuid not null references campus(id),
  material_code text not null,
  kind          text not null check (kind in ('in', 'out', 'count', 'writeoff', 'minimum')),
  quantity      numeric(12, 3) not null check (quantity >= 0),
  expected      numeric(12, 3),
  class_label   text check (class_label is null or btrim(class_label) <> ''),
  expense_id    uuid references expense(id),
  reason        text check (reason is null or btrim(reason) <> ''),
  staff_id      uuid not null references staff(id),
  at            timestamptz not null default now(),
  foreign key (tenant_id, material_code) references material_item(tenant_id, code),
  check (kind in ('count', 'minimum') or quantity > 0),
  check ((kind = 'out') = (class_label is not null)),
  check (kind = 'in' or expense_id is null),
  check ((kind = 'count') = (expected is not null)),
  check (kind <> 'writeoff' or reason is not null)
);
create index if not exists stock_move_item_idx on stock_move (tenant_id, campus_id, material_code, seq);
comment on table stock_move is 'A move in a campus''s store (CP-82): in, out (to a class), count (quantity counted, expected = what the books said), writeoff (with its reason) or minimum (newest wins). Append-only.';
comment on column stock_move.expected is 'For a count: what the books said just before it, so the difference it kept is on the row.';

drop trigger if exists stock_move_append_only on stock_move;
create trigger stock_move_append_only before update or delete on stock_move
  for each statement execute function internal.forbid_change();

-- On hand = the last count plus the moves after it (in adds; out and write-off take away); nothing counted yet starts from nothing. `recorded` is how many
-- moves other than a minimum the item has: with none, the books have nothing to compare a first count with.
create or replace view stock_level with (security_invoker = true) as
with last as (
  select tenant_id, campus_id, material_code,
         max(seq) filter (where kind = 'count') as count_seq,
         max(seq) filter (where kind = 'minimum') as minimum_seq,
         count(*) filter (where kind <> 'minimum') as recorded
  from stock_move
  group by tenant_id, campus_id, material_code
)
select l.tenant_id, l.campus_id, l.material_code,
       coalesce(c.quantity, 0) + coalesce((
         select sum(case m.kind when 'in' then m.quantity else -m.quantity end)
         from stock_move m
         where m.tenant_id = l.tenant_id and m.campus_id = l.campus_id and m.material_code = l.material_code
           and m.kind in ('in', 'out', 'writeoff') and m.seq > coalesce(l.count_seq, 0)), 0) as on_hand,
       mn.quantity as minimum,
       l.recorded
from last l
left join stock_move c on c.seq = l.count_seq
left join stock_move mn on mn.seq = l.minimum_seq;
comment on view stock_level is 'What each campus holds of each catalogue item (CP-82): the last count plus the moves after it, and the newest minimum. Never a table.';

do $$
begin
  if exists (select from pg_roles where rolname = 'app_engine') then
    grant select, insert on stock_move to app_engine;
    grant select on stock_level to app_engine;
  end if;
  if exists (select from pg_roles where rolname = 'app_web') then
    grant select on stock_move, stock_level to app_web;
  end if;
end $$;

insert into access_table (schema_name, table_name, kind_code, key_column, key_type, data_class, reason) values
  ('public', 'stock_move', null, null, null, 'school_wide', 'what a campus''s store holds: the engine lets only the campus''s keeper, a coordinator or a founder through it')
on conflict (schema_name, table_name) do update set kind_code = excluded.kind_code, key_column = excluded.key_column,
  key_type = excluded.key_type, data_class = excluded.data_class, reason = excluded.reason;

select internal.apply_conventions();
