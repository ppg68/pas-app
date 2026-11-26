-- PAS 0061: expense reports are checked by the CAP before they are authorized for payment.
-- Flow: requester sends -> CAP verifies (or sends back) -> superior (if chosen) -> RAC / CAR.
--   expense_reports.cap_verified_at / _by / _by_name   written only by the functions below
-- The CAP (or an ADMIN) sees every expense report. After the verification the requester cannot edit it any more.
-- Apply with psql / SQL Editor (NOT `supabase db push`). Run after pas_0060.

alter table pas.expense_reports
  add column if not exists cap_verified_at timestamptz,
  add column if not exists cap_verified_by uuid references pas.profiles(id) on delete set null,
  add column if not exists cap_verified_by_name text;

create or replace function pas.expense_cap_guard()
returns trigger
language plpgsql security definer set search_path = pas, pg_temp as $$
begin
  if auth.uid() is null or current_setting('pas.bypass_guard', true) = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.cap_verified_at is not null or new.cap_verified_by is not null or new.cap_verified_by_name is not null then
      raise exception 'The CAP verification can only be placed by the CAP.';
    end if;
  elsif new.cap_verified_at is distinct from old.cap_verified_at
     or new.cap_verified_by is distinct from old.cap_verified_by
     or new.cap_verified_by_name is distinct from old.cap_verified_by_name then
    raise exception 'The CAP verification can only be placed by the CAP.';
  end if;
  return new;
end;
$$;

drop trigger if exists expense_cap_guard_trg on pas.expense_reports;
create trigger expense_cap_guard_trg
  before insert or update on pas.expense_reports
  for each row execute function pas.expense_cap_guard();

create or replace function pas.is_expense_viewer(uid uuid)
returns boolean as $$
  select exists (select 1 from pas.user_roles where user_id = uid and role in ('ADMIN', 'RAC', 'CAR', 'DG', 'CAP'));
$$ language sql security definer set search_path = pas, pg_temp stable;

create or replace function pas.expense_report_editable(rid uuid)
returns boolean as $$
  select exists (select 1 from pas.expense_reports where id = rid and status = 'pending' and cap_verified_at is null)
     and not exists (select 1 from pas.expense_approvals where report_id = rid and signed_at is not null);
$$ language sql security definer set search_path = pas, pg_temp stable;

create or replace function pas.cap_verify_expense_report(rid uuid)
returns void as $$
declare
  rep pas.expense_reports%rowtype;
  who text;
begin
  if not exists (select 1 from pas.user_roles where user_id = auth.uid() and role in ('CAP', 'ADMIN')) then
    raise exception 'Only the CAP or an administrator can verify an expense report.';
  end if;
  select * into rep from pas.expense_reports where id = rid for update;
  if not found then
    raise exception 'Expense report not found.';
  end if;
  if rep.status <> 'pending' then
    raise exception 'This report is not awaiting verification.';
  end if;
  if rep.cap_verified_at is not null then
    raise exception 'Already verified.';
  end if;
  if auth.uid() = rep.requested_by or auth.uid() = rep.worker_id then
    raise exception 'Segregation of duties: you cannot verify your own report.';
  end if;
  -- every row but the mileage ones needs its receipt (older reports attached receipts by budget line)
  if not exists (select 1 from pas.expense_files where report_id = rid and line_id is null)
     and exists (
       select 1 from pas.expense_lines l
        where l.report_id = rid and l.section <> 'km'
          and not exists (select 1 from pas.expense_files f where f.line_id = l.id and f.kind <> 'payment_proof')
     ) then
    raise exception 'Some receipts are missing: send the report back to the requester.';
  end if;
  select full_name into who from pas.profiles where id = auth.uid();
  perform set_config('pas.bypass_guard', '1', true);
  update pas.expense_reports
     set cap_verified_at = now(), cap_verified_by = auth.uid(), cap_verified_by_name = who
   where id = rid;
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

-- The CAP sends the report back: verification and approvals are cleared, the requester can edit it again.
create or replace function pas.cap_return_expense_report(rid uuid)
returns void as $$
declare
  rep pas.expense_reports%rowtype;
begin
  if not exists (select 1 from pas.user_roles where user_id = auth.uid() and role in ('CAP', 'ADMIN')) then
    raise exception 'Only the CAP or an administrator can send an expense report back.';
  end if;
  select * into rep from pas.expense_reports where id = rid for update;
  if not found then
    raise exception 'Expense report not found.';
  end if;
  if rep.status <> 'pending' then
    raise exception 'Only a report not yet approved can be sent back.';
  end if;
  perform set_config('pas.bypass_guard', '1', true);
  update pas.expense_approvals set signed_at = null where report_id = rid;
  update pas.expense_reports
     set cap_verified_at = null, cap_verified_by = null, cap_verified_by_name = null
   where id = rid;
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

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
  update pas.expense_reports
     set status = 'pending', cap_verified_at = null, cap_verified_by = null, cap_verified_by_name = null
   where id = rid;
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

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
  if rep.cap_verified_at is null then
    raise exception 'The CAP must verify the report first.';
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
  if auth.uid() = rep.requested_by or auth.uid() = rep.worker_id then
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

grant execute on function
  pas.cap_verify_expense_report(uuid), pas.cap_return_expense_report(uuid),
  pas.reopen_expense_report(uuid), pas.sign_expense_report(uuid, pas.app_role),
  pas.is_expense_viewer(uuid), pas.expense_report_editable(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
