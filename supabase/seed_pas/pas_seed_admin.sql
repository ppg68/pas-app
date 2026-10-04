-- PAS — initial ADMIN. Run (psql / SQL editor) AFTER Paolo has registered and logged in once
-- in the NEW project (the profile is created lazily on first login). Looks the user up by
-- email; no UUIDs. Must return exactly 1 row.
insert into pas.user_roles (user_id, role)
select id, 'ADMIN' from pas.profiles
where lower(email) = 'paolo.gioffreda@istituto-oikos.org'
on conflict do nothing;

select p.email, ur.role from pas.user_roles ur join pas.profiles p on p.id = ur.user_id where ur.role = 'ADMIN';
