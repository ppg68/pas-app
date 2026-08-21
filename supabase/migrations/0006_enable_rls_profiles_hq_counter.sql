-- PAS — fix: profiles and hq_counter were created in 0001_init.sql without ever
-- enabling Row Level Security (unlike the other tables, lines 127-134 of
-- 0001_init.sql). Supabase flagged them as "rls_disabled_in_public": anyone who
-- knew the project URL could have read/written these tables via the anon key.

alter table profiles enable row level security;
alter table hq_counter enable row level security;

-- profiles: readable by anyone authenticated (needed to show names on
-- requests/signatures), writable only on one's own profile.
create policy "authenticated read profiles" on profiles for select
  using (auth.role() = 'authenticated');

create policy "user updates own profile" on profiles for update
  using (id = auth.uid());

-- hq_counter: no policy for regular users. The only access point remains the
-- next_hq_number() function (0003_hq_counter_lock.sql), which runs as
-- security definer and therefore bypasses RLS.
