-- Team: "Remove" a person from PAS. Deletes only the PAS profile (and, by cascade, their roles);
-- the auth.users account is shared with the other apps and is NOT touched. If the person signs in to
-- PAS again, ensure_profile() recreates an empty profile. Refused for yourself and for people who already
-- appear on requests, signatures, contracts, etc. (those rows point at the profile).
create or replace function pas.remove_person(target uuid)
returns void as $$
begin
  if not pas.is_admin(auth.uid()) then
    raise exception 'Only an ADMIN can remove people from PAS.';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot remove yourself.';
  end if;
  delete from pas.profiles where id = target;
exception when foreign_key_violation then
  raise exception 'This person appears on existing requests, signatures or contracts and cannot be removed. Remove their roles instead.';
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

revoke execute on function pas.remove_person(uuid) from public, anon;
grant execute on function pas.remove_person(uuid) to authenticated, service_role;
