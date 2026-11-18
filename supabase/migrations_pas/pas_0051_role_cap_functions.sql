-- PAS 0051: the CAP role can be looked up by the app and can open trip requests.
-- Run AFTER pas_0050, as a separate run (a new enum value cannot be used in the same transaction that adds it).

create or replace function pas.contract_role_holders(r pas.app_role)
returns table (id uuid, full_name text, email text) as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;
  if r not in ('PM', 'RAC', 'CAR', 'CONTRACTS', 'DG', 'LOG', 'CAP') then
    raise exception 'Role not available.';
  end if;
  return query
    select p.id, p.full_name, p.email
      from pas.user_roles ur
      join pas.profiles p on p.id = ur.user_id
     where ur.role = r
     order by p.full_name;
end;
$$ language plpgsql security definer set search_path = pas, pg_temp stable;

create or replace function pas.is_trip_viewer(uid uuid)
returns boolean as $$
  select exists (select 1 from pas.user_roles where user_id = uid and role in ('LOG', 'ADMIN', 'RAC', 'CAR', 'DG', 'CAP'));
$$ language sql security definer set search_path = pas, pg_temp stable;

notify pgrst, 'reload schema';
