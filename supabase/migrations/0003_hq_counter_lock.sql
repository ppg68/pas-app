-- PAS — IR (HQ) counter with lock, to prevent two Budget Holders from getting
-- the same number when creating requests at the same moment.
-- Call it via RPC (supabase.rpc('next_hq_number')) within the same request that
-- then inserts the row into `requests` — not separately, otherwise the lock is
-- released before the number is actually used.

create or replace function next_hq_number()
returns int as $$
declare
  n int;
begin
  select next_number into n from hq_counter where id = true for update;
  update hq_counter set next_number = n + 1 where id = true;
  return n;
end;
$$ language plpgsql security definer;

-- Who can create a new request is already restricted by the "BH creates
-- requests" policy on `requests`; this function should still only be run as part
-- of the same flow (server action), not exposed as an open endpoint.
revoke execute on function next_hq_number() from public;
grant execute on function next_hq_number() to authenticated;
