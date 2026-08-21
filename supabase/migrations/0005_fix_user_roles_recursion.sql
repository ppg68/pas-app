-- PAS — fix: "RAC/CAR manage roles" on user_roles was querying user_roles itself in
-- its own USING clause. Since the sub-query is itself subject to RLS, the policy
-- kept re-triggering itself infinitely ("infinite recursion detected in policy for
-- relation user_roles", 42P17) — any SELECT on user_roles failed silently on the
-- client side (no rows, but with an error object that was never checked until now).
--
-- Standard Postgres/Supabase fix: the role check now goes through a SECURITY
-- DEFINER function, which runs with the owner's privileges (postgres) and therefore
-- doesn't re-apply RLS to the inner sub-query.

create or replace function is_rac_or_car(uid uuid)
returns boolean as $$
  select exists (
    select 1 from user_roles where user_id = uid and role in ('RAC', 'CAR')
  );
$$ language sql security definer set search_path = public stable;

drop policy "RAC/CAR manage roles" on user_roles;
create policy "RAC/CAR manage roles" on user_roles for all
  using (is_rac_or_car(auth.uid()));
