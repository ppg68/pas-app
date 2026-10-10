-- PAS 0006: project CUP read from Progetti approvati (public.adm_progetti.cup).
-- Same approach as pas.project_deadlines(): a security-definer function exposing ONLY project code and
-- CUP, and only to people with the CONTRACTS role. Read-only: nothing in Progetti approvati is modified.

create or replace function pas.project_cups()
returns table (codice text, cup text)
language sql stable security definer set search_path = pas, public, pg_temp as $$
  select upper(btrim(p.codice)), max(btrim(p.cup))
  from public.adm_progetti p
  where pas.has_contracts_access(auth.uid())
    and p.cup is not null
    and btrim(p.cup) <> ''
  group by upper(btrim(p.codice))
$$;

revoke all on function pas.project_cups() from public, anon;
grant execute on function pas.project_cups() to authenticated;
