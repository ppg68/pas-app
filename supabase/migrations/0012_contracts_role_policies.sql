-- PAS — restrict Contracts to a named few, not every authenticated PAS user.
-- The Contracts module was originally opened to any authenticated user for
-- read (mirroring `requests`), with write limited to PM/LOG/CAR/RAC. In
-- practice contracts data is sensitive HR/consultant info that should only be
-- visible to whoever holds the new CONTRACTS role (assigned from Settings ->
-- Team, same mechanism as every other role) — apply after 0011_contracts_role.sql.

drop policy if exists "authenticated read contracts" on contracts;
drop policy if exists "authenticated read tranches" on contract_tranches;
drop policy if exists "PM/LOG/CAR/RAC manage contracts" on contracts;
drop policy if exists "PM/LOG/CAR/RAC manage tranches" on contract_tranches;

create policy "CONTRACTS role reads contracts" on contracts for select
  using (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'CONTRACTS')
  );

create policy "CONTRACTS role reads tranches" on contract_tranches for select
  using (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'CONTRACTS')
  );

create policy "CONTRACTS role manages contracts" on contracts for all
  using (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'CONTRACTS')
  )
  with check (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'CONTRACTS')
  );

create policy "CONTRACTS role manages tranches" on contract_tranches for all
  using (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'CONTRACTS')
  )
  with check (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'CONTRACTS')
  );
