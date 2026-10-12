-- Pending roles: an ADMIN (or a CONTRACTS holder, for the CONTRACTS role only) can pre-assign a role to an
-- email that has not signed in to PAS yet. The role is applied automatically by ensure_profile() the first
-- time that person signs in, and the pending row is deleted. Nothing else in the schema changes.
create table if not exists pas.pending_roles (
  email text not null,
  role pas.app_role not null,
  created_by uuid references pas.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (email, role)
);

alter table pas.pending_roles enable row level security;

create policy "ADMIN manages pending roles" on pas.pending_roles for all
  using (pas.is_admin(auth.uid()))
  with check (pas.is_admin(auth.uid()));
create policy "CONTRACTS holder manages pending CONTRACTS" on pas.pending_roles for all
  using (role = 'CONTRACTS' and pas.has_contracts_access(auth.uid()))
  with check (role = 'CONTRACTS' and pas.has_contracts_access(auth.uid()));

create or replace function pas.ensure_profile()
returns void as $$
begin
  insert into pas.profiles (id, full_name, email)
  select u.id,
         coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
         u.email
  from auth.users u
  where u.id = auth.uid()
  on conflict (id) do nothing;

  -- apply roles waiting for this email, then clear them
  insert into pas.user_roles (user_id, role)
  select auth.uid(), p.role
  from pas.pending_roles p
  join auth.users u on lower(u.email) = lower(p.email)
  where u.id = auth.uid()
  on conflict do nothing;

  delete from pas.pending_roles p
  using auth.users u
  where u.id = auth.uid() and lower(u.email) = lower(p.email);
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;
