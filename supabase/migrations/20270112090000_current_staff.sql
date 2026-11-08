-- CP-2: a request says who is asking. The website sets `app.staff_id` (transaction-local) from the verified sign-in
-- cookie, in apps/web/lib/db.ts and nowhere else; this function reads it back. It lives in `public` because neither app
-- login has USAGE on schema `internal`. It switches no rule on: nothing calls it yet (CP-3 does).
--
-- A uuid or nothing: unset, empty, blank or anything that is not a uuid gives null, and it never raises. The shape is
-- checked before the cast so a bad value cannot fail a query that merely asked who is asking.
create or replace function public.current_staff() returns uuid
language sql stable security invoker set search_path = pg_catalog, public as $$
  select case when v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v::uuid end
  from (select nullif(btrim(current_setting('app.staff_id', true)), '') as v) s
$$;

revoke all on function public.current_staff() from public;

do $$ begin
  if exists (select from pg_roles where rolname = 'app_web') then
    grant execute on function public.current_staff() to app_web;
  end if;
  if exists (select from pg_roles where rolname = 'app_engine') then
    grant execute on function public.current_staff() to app_engine;
  end if;
end $$;
