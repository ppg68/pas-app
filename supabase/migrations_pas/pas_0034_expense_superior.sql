-- PAS 0034: expense reports, the "superior" approval is optional and open to any registered person.
--
-- Before: the PM approval was compulsory and had to be a PM. Now the requester may choose any PAS user as
-- "superior" (slot 'PM' kept in the table, shown as "Superior") or none. The RAC / CAR signature is always
-- required and comes AFTER the superior's one (when there is a superior).
-- Apply with psql / SQL Editor (NOT `supabase db push`). Run after pas_0033.

-- Everyone registered in PAS, so that any staff member can pick the superior (profiles are not readable by all).
create or replace function pas.expense_superiors()
returns table (id uuid, full_name text, email text) as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;
  return query
    select p.id, p.full_name, p.email
      from pas.profiles p
     order by p.full_name;
end;
$$ language plpgsql security definer set search_path = pas, pg_temp stable;

create or replace function pas.sign_expense_report(rid uuid, as_role pas.app_role)
returns jsonb as $$
declare
  rep pas.expense_reports%rowtype;
  ap pas.expense_approvals%rowtype;
  remaining int;
begin
  select * into rep from pas.expense_reports where id = rid for update;
  if not found then
    raise exception 'Expense report not found.';
  end if;
  if rep.status <> 'pending' then
    raise exception 'This report is not awaiting approval.';
  end if;
  if as_role not in ('PM', 'RAC') then
    raise exception 'Only the superior or the RAC / CAR can approve an expense report.';
  end if;
  select * into ap from pas.expense_approvals where report_id = rid and signer_role = as_role;
  if not found or ap.user_id <> auth.uid() then
    raise exception 'You are not the designated approver for this role.';
  end if;
  if ap.signed_at is not null then
    raise exception 'Already approved.';
  end if;
  if auth.uid() = rep.requested_by then
    raise exception 'Segregation of duties: the requester cannot approve their own report.';
  end if;
  if as_role = 'RAC' then
    if not exists (select 1 from pas.user_roles where user_id = auth.uid() and role in ('RAC', 'CAR')) then
      raise exception 'You do not hold the role needed to approve (RAC or CAR).';
    end if;
    if exists (select 1 from pas.expense_approvals where report_id = rid and signer_role = 'PM' and signed_at is null) then
      raise exception 'The superior must approve first.';
    end if;
  end if;

  update pas.expense_approvals set signed_at = now() where report_id = rid and signer_role = as_role;

  select count(*) into remaining from pas.expense_approvals where report_id = rid and signed_at is null;
  if remaining = 0 then
    perform set_config('pas.bypass_guard', '1', true);
    update pas.expense_reports set status = 'approved' where id = rid;
  end if;

  return jsonb_build_object('all_signed', remaining = 0);
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

grant execute on function pas.expense_superiors(), pas.sign_expense_report(uuid, pas.app_role)
  to authenticated, service_role;
