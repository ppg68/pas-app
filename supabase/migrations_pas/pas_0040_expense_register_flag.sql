-- PAS 0040: the administration flags an approved expense report as imported in Callisto.
-- The accounting protocol becomes optional (the flag is the memo of what is still to be imported).
-- Apply with psql / SQL Editor. Run after pas_0039.
create or replace function pas.register_expense_report(rid uuid, protocol text, note text)
returns void as $$
declare
  rep pas.expense_reports%rowtype;
  who text;
begin
  select * into rep from pas.expense_reports where id = rid for update;
  if not found then
    raise exception 'Expense report not found.';
  end if;
  if rep.status <> 'approved' then
    raise exception 'The report is not waiting to be imported in Callisto.';
  end if;
  if not exists (select 1 from pas.user_roles where user_id = auth.uid() and role in ('CAR', 'RAC', 'ADMIN')) then
    raise exception 'Only the administration (CAR / RAC) can flag the report as imported in Callisto.';
  end if;
  select full_name into who from pas.profiles where id = auth.uid();
  perform set_config('pas.bypass_guard', '1', true);
  update pas.expense_reports
     set status = 'registered',
         callisto_protocol = nullif(btrim(protocol), ''),
         registered_by = auth.uid(),
         registered_by_name = who,
         registered_at = now(),
         registration_note = nullif(btrim(note), '')
   where id = rid;
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

grant execute on function pas.register_expense_report(uuid, text, text) to authenticated, service_role;
