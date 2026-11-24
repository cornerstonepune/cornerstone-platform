-- An empty list ([] or {}) is an empty field: a new row's history keeps only fields that hold something.
-- CP-70 made activity.also_bands watched; an activity added with no extra grades logged also_bands = [].
-- Same function as 20270125210000_cp27_settings_and_history.sql; only the empty check changes. ADR 0106.
create or replace function internal.change_kept() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  watched text[] := case when tg_nargs > 1 then tg_argv[1:tg_nargs - 1] else array(
                      select k from jsonb_object_keys(r) k where k not in ('id', 'tenant_id', 'created_at', 'updated_at'))
                    end;
  b jsonb := '{}';
  a jsonb := '{}';
  f text;
  who text := nullif(btrim(current_setting('app.changed_by', true)), '');
  person uuid;
begin
  foreach f in array watched loop
    if tg_op = 'UPDATE' then
      if o -> f is distinct from n -> f then
        b := b || jsonb_build_object(f, o -> f);
        a := a || jsonb_build_object(f, n -> f);
      end if;
    elsif coalesce(r ->> f, '') not in ('', '[]', '{}') then
      if tg_op = 'INSERT' then a := a || jsonb_build_object(f, n -> f); else b := b || jsonb_build_object(f, o -> f); end if;
    end if;
  end loop;
  if tg_op = 'UPDATE' and a = '{}' then
    return null;
  end if;
  person := (select s.id from staff s
              where s.id::text = lower(substring(who from 'staff:([0-9A-Fa-f-]{36})')));
  insert into change_log (tenant_id, table_name, row_id, op, before, after, staff_id, origin, reason)
  values ((r ->> 'tenant_id')::uuid, tg_table_name,
          (select string_agg(r ->> k, ' ' order by i) from unnest(string_to_array(tg_argv[0], ',')) with ordinality u (k, i)),
          lower(tg_op), nullif(b, '{}'), nullif(a, '{}'),
          coalesce(person, public.signed_in_staff()), coalesce(who, session_user::text),
          nullif(btrim(current_setting('app.change_reason', true)), ''));
  return null;
end $$;
