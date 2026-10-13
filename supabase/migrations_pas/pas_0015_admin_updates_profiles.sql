-- An ADMIN can correct the name of any person from the Team page (names are otherwise taken from the
-- login email for accounts created by hand). Each user could already update their own profile.
create policy "ADMIN updates profiles" on pas.profiles for update
  using (pas.is_admin(auth.uid()))
  with check (pas.is_admin(auth.uid()));
