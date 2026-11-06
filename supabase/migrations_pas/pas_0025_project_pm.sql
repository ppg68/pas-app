-- PAS 0025: the Project Manager of each project, read from Progetti approvati (public.adm_progetti.pm_user_id,
-- set by migration adm_0020 of that app). Same approach as pas.project_cups(): a security-definer function that
-- exposes ONLY project code + PM user id, read-only, to PAS members (and the CONTRACTS role).
-- Used when a request is created: if the person compiling is the PM of the project, no PM signature is needed;
-- otherwise the PM of that project signs (even when the person compiling holds the PM role on other projects).
-- Variants (child projects, e.g. 53E_partner) take the PM of their main project.
-- Run after pas_0024 AND after adm_0020 (Progetti approvati). Nothing is modified, only a function is added.

create or replace function pas.project_pms()
returns table (codice text, pm_user_id uuid)
language sql stable security definer set search_path = pas, public, pg_temp as $$
  select distinct on (upper(btrim(p.codice)))
         upper(btrim(p.codice)) as codice,
         coalesce(p.pm_user_id, par.pm_user_id) as pm_user_id
  from public.adm_progetti p
  left join public.adm_progetti par on par.id = p.parent_id
  where (pas.has_contracts_access(auth.uid()) or pas.is_member(auth.uid()))
    and coalesce(p.pm_user_id, par.pm_user_id) is not null
  order by upper(btrim(p.codice)), p.id
$$;

revoke all on function pas.project_pms() from public, anon;
grant execute on function pas.project_pms() to authenticated;
