-- PAS 0005: shared settings (key/value), editable by people with the CONTRACTS role.
-- First setting: deadline_warn_days = how many days before the end of a project a contract
-- with payments still pending is flagged "ending soon" (default 60).

create table if not exists pas.settings (
  key text primary key,
  value text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table pas.settings enable row level security;

drop policy if exists "CONTRACTS role reads settings" on pas.settings;
create policy "CONTRACTS role reads settings" on pas.settings for select
  using (pas.has_contracts_access(auth.uid()));

drop policy if exists "CONTRACTS role manages settings" on pas.settings;
create policy "CONTRACTS role manages settings" on pas.settings for all
  using (pas.has_contracts_access(auth.uid()))
  with check (pas.has_contracts_access(auth.uid()));

revoke all on pas.settings from anon;
grant select, insert, update on pas.settings to authenticated;
grant select, insert, update, delete on pas.settings to service_role;

insert into pas.settings (key, value) values ('deadline_warn_days', '60')
on conflict (key) do nothing;
