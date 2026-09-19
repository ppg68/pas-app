-- PAS — let existing Contracts-access holders grant/revoke that same role to
-- others themselves (via /contracts/access), without needing RAC/CAR or the
-- Supabase SQL Editor. Scoped strictly to role = 'CONTRACTS' rows — this does
-- NOT let a Contracts-only user touch anyone's BH/PM/LOG/CAR/RAC/DG rows,
-- that stays exclusive to "RAC/CAR manage roles" (0001_init.sql).
create policy "CONTRACTS role self-manages contracts access" on user_roles for all
  using (
    role = 'CONTRACTS'
    and exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role = 'CONTRACTS')
  )
  with check (
    role = 'CONTRACTS'
    and exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role = 'CONTRACTS')
  );
