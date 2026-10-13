-- IR numbering per office: "1/IT", "2/IT", ... (country code of the office, continuous, no year).
-- Requests created in the app get their number from next_ir_number(); the numbers of the historic
-- register (796, 801, ...) are untouched, so the two series can never collide.
-- Apply with psql / SQL Editor (NOT `supabase db push`). Nothing outside schema pas is touched.

create table if not exists pas.ir_counters (
  office text primary key,
  next_number int not null default 1
);

-- no policy on purpose: only next_ir_number() (SECURITY DEFINER) touches it
alter table pas.ir_counters enable row level security;

alter table pas.requests add column if not exists ir_number text;
create unique index if not exists idx_requests_ir_number
  on pas.requests(ir_number) where ir_number is not null;

create or replace function pas.next_ir_number(office text)
returns text as $$
declare
  o text := upper(trim(office));
  n int;
begin
  -- Shared project: other apps' users are also `authenticated`; only PAS members may draw numbers.
  if auth.uid() is not null and not pas.is_member(auth.uid()) then
    raise exception 'Not a PAS member';
  end if;
  if o is null or o = '' then
    raise exception 'Office code required';
  end if;

  insert into pas.ir_counters (office, next_number) values (o, 1) on conflict (office) do nothing;
  select next_number into n from pas.ir_counters where pas.ir_counters.office = o for update;
  update pas.ir_counters set next_number = n + 1 where pas.ir_counters.office = o;
  return n || '/' || o;
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

revoke execute on function pas.next_ir_number(text) from public, anon;
grant execute on function pas.next_ir_number(text) to authenticated, service_role;
