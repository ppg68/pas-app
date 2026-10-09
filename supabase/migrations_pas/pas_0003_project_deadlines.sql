-- PAS 0003: project deadlines read from Progetti approvati (public.adm_progetti).
-- Contracts users cannot read adm_progetti directly (it is protected by Progetti approvati's own
-- roles), so this security-definer function exposes ONLY code + end date, and only to CONTRACTS.
-- Read-only: nothing in Progetti approvati is modified.

create or replace function pas.project_deadlines()
returns table (codice text, data_fine date)
language sql stable security definer set search_path = pas, public, pg_temp as $$
  select upper(p.codice), max(p.data_fine)
  from public.adm_progetti p
  where pas.has_contracts_access(auth.uid())
    and p.data_fine is not null
  group by upper(p.codice)
$$;

revoke all on function pas.project_deadlines() from public, anon;
grant execute on function pas.project_deadlines() to authenticated;
