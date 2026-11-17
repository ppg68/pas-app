-- PAS 0047: expense reports. The project in Progetti approvati gives the CUP\AID and the official donor project
-- code (public.adm_progetti.cup / codice_donatore). Same approach as pas.project_cups(): security-definer,
-- read-only, exposes ONLY project code + CUP + donor code, to PAS members and the CONTRACTS role.
-- Also stores the CUP\AID on the report.

create or replace function pas.project_codes()
returns table (codice text, cup text, donor_code text)
language sql stable security definer set search_path = pas, public, pg_temp as $$
  select upper(btrim(p.codice)),
         max(nullif(btrim(p.cup), '')),
         max(nullif(btrim(p.codice_donatore), ''))
  from public.adm_progetti p
  where (pas.has_contracts_access(auth.uid()) or pas.is_member(auth.uid()))
  group by upper(btrim(p.codice))
$$;

revoke all on function pas.project_codes() from public, anon;
grant execute on function pas.project_codes() to authenticated;

alter table pas.expense_reports add column if not exists cup_code text;
