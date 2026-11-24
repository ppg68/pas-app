-- PAS 0060: an ADMIN can reopen an approved expense report (not yet imported in Callisto, not paid) so that the
-- requester can correct it (e.g. the exchange rates): the signatures are cleared, the report goes back to "pending",
-- the requester edits it and sends it to the approvers again.
-- Apply with psql / SQL Editor (NOT `supabase db push`). Run after pas_0059.

create or replace function pas.reopen_expense_report(rid uuid)
returns void as $$
declare
  rep pas.expense_reports%rowtype;
begin
  if not pas.is_admin(auth.uid()) then
    raise exception 'Only an administrator can reopen an expense report.';
  end if;
  select * into rep from pas.expense_reports where id = rid for update;
  if not found then
    raise exception 'Expense report not found.';
  end if;
  if rep.status <> 'approved' then
    raise exception 'Only an approved report (not yet imported in Callisto) can be reopened.';
  end if;
  if rep.paid_at is not null then
    raise exception 'The report is flagged as paid: remove the paid flag first.';
  end if;
  perform set_config('pas.bypass_guard', '1', true);
  update pas.expense_approvals set signed_at = null where report_id = rid;
  update pas.expense_reports set status = 'pending' where id = rid;
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

grant execute on function pas.reopen_expense_report(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
