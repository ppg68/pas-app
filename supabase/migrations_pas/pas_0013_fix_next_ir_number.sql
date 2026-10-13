-- Fix for pas_0012: the parameter "office" had the same name as the column pas.ir_counters.office, so
-- PostgreSQL reported 'column reference "office" is ambiguous'. Same signature, same behaviour.

create or replace function pas.next_ir_number(office text)
returns text as $$
#variable_conflict use_column
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

  insert into pas.ir_counters (office, next_number) values (o, 1)
    on conflict on constraint ir_counters_pkey do nothing;
  select c.next_number into n from pas.ir_counters c where c.office = o for update;
  update pas.ir_counters c set next_number = n + 1 where c.office = o;
  return n || '/' || o;
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

revoke execute on function pas.next_ir_number(text) from public, anon;
grant execute on function pas.next_ir_number(text) to authenticated, service_role;
