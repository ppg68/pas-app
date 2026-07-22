-- PAS — fix: "RAC/CAR manage roles" su user_roles interrogava user_roles stessa nella
-- propria USING clause. Essendo la sotto-query soggetta anch'essa a RLS, la policy si
-- ri-attivava su se stessa all'infinito ("infinite recursion detected in policy for
-- relation user_roles", 42P17) — qualunque SELECT su user_roles falliva silenziosamente
-- lato client (nessuna riga, ma con un error object mai controllato prima d'ora).
--
-- Fix standard Postgres/Supabase: il controllo del ruolo passa da una funzione
-- SECURITY DEFINER, che gira con i privilegi del proprietario (postgres) e quindi non
-- ri-applica RLS alla sotto-query interna.

create or replace function is_rac_or_car(uid uuid)
returns boolean as $$
  select exists (
    select 1 from user_roles where user_id = uid and role in ('RAC', 'CAR')
  );
$$ language sql security definer set search_path = public stable;

drop policy "RAC/CAR manage roles" on user_roles;
create policy "RAC/CAR manage roles" on user_roles for all
  using (is_rac_or_car(auth.uid()));
