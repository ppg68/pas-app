-- PAS — fix: 0013's "CONTRACTS role self-manages contracts access" policy on
-- user_roles queried user_roles itself in its own USING/WITH CHECK clause.
-- Same bug as 0005 (see that file's comment): the sub-query is itself subject
-- to RLS, so the policy re-triggers itself infinitely ("infinite recursion
-- detected in policy for relation user_roles", 42P17) — every SELECT on
-- user_roles fails silently client-side, for every user, not just the ones
-- touched by the new policy. Same fix as 0005: route the check through a
-- SECURITY DEFINER function, which runs as the owner and isn't re-subject to
-- RLS on its own inner query.

create or replace function has_contracts_access(uid uuid)
returns boolean as $$
  select exists (
    select 1 from user_roles where user_id = uid and role = 'CONTRACTS'
  );
$$ language sql security definer set search_path = public stable;

drop policy if exists "CONTRACTS role self-manages contracts access" on user_roles;
create policy "CONTRACTS role self-manages contracts access" on user_roles for all
  using (role = 'CONTRACTS' and has_contracts_access(auth.uid()))
  with check (role = 'CONTRACTS' and has_contracts_access(auth.uid()));
