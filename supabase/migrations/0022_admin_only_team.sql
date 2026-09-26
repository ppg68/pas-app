-- PAS — only ADMIN can manage roles (Team page). Previously RAC/CAR could.
-- Uses a SECURITY DEFINER function to avoid the user_roles self-reference
-- recursion described in 0005/0014.
-- Run AFTER 0021_admin_role.sql.

create or replace function is_admin(uid uuid)
returns boolean as $$
  select exists (select 1 from user_roles where user_id = uid and role = 'ADMIN');
$$ language sql security definer set search_path = public stable;

-- Grant ADMIN first, so the policy swap below never locks everyone out.
insert into user_roles (user_id, role)
select id, 'ADMIN' from profiles where lower(email) = 'paolo.gioffreda@istituto-oikos.org'
on conflict do nothing;

drop policy if exists "RAC/CAR manage roles" on user_roles;
create policy "ADMIN manages roles" on user_roles for all
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));

-- Sanity check: must return exactly 1 row (you).
select p.email, ur.role from user_roles ur join profiles p on p.id = ur.user_id where ur.role = 'ADMIN';
