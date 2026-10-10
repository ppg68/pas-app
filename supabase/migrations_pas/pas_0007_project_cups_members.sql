-- PAS 0007: the project CUP (from Approved projects) is also needed by whoever opens a purchase
-- request (PM, CAR, RAC...), not only by the CONTRACTS role. CUP codes are not sensitive for people
-- who work on the project purchases. The function still exposes ONLY project code + CUP, read-only.

create or replace function pas.project_cups()
returns table (codice text, cup text)
language sql stable security definer set search_path = pas, public, pg_temp as $$
  select upper(btrim(p.codice)), max(btrim(p.cup))
  from public.adm_progetti p
  where (pas.has_contracts_access(auth.uid()) or pas.is_member(auth.uid()))
    and p.cup is not null
    and btrim(p.cup) <> ''
  group by upper(btrim(p.codice))
$$;

revoke all on function pas.project_cups() from public, anon;
grant execute on function pas.project_cups() to authenticated;
