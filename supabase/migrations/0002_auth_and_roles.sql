-- PAS — auth wiring: automatic profile on sign-up + restricted email domain.
-- Apply after 0001_init.sql.

-- === Restricted email domain ===
-- Blocks the creation of the Supabase Auth user itself (not just the profile),
-- so no "orphan" accounts are left without a row in profiles.
create or replace function restrict_email_domain()
returns trigger as $$
begin
  if new.email is null or new.email !~* '@istituto-oikos\.org$' then
    raise exception 'Only @istituto-oikos.org addresses are allowed in PAS';
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_restrict_email_domain
  before insert on auth.users
  for each row
  execute function restrict_email_domain();

-- === Automatic profile ===
-- Standard Supabase pattern: when auth.users receives a new row (after the domain
-- check), we create the corresponding row in profiles. full_name comes from
-- raw_user_meta_data if present (e.g. if you later add a form with a name field),
-- otherwise the local part of the email is used as a placeholder to fix up later.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_create_profile
  after insert on auth.users
  for each row
  execute function handle_new_user();

-- === Bootstrapping the first administrator ===
-- user_roles is protected by RLS: only someone who already has the RAC/CAR role can
-- assign roles (see 0001_init.sql). The very first person must therefore be promoted
-- by hand, once, from the SQL Editor (which runs as postgres and bypasses RLS) AFTER
-- their first login:
--
--   insert into user_roles (user_id, role)
--   select id, 'RAC' from profiles where email = 'person.name@istituto-oikos.org';
--
-- From there they can assign roles to others from the Settings → Team page.
