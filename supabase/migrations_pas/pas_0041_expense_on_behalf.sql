-- PAS 0041: expense reports filed on behalf of another person.
--
-- Logistics and Contracts sometimes fill in the expense report of a colleague. Only people flagged by the
-- ADMIN (Settings > Team: "Files expense reports for others") can choose another person as the worker.
--   pas.profiles.can_file_for_others   the flag, changed only by an ADMIN
--   pas.expense_reports.worker_id      the person the report is for (null = the person who filed it)
-- The worker can see the report; the Callisto account used for the import is the worker's. Neither the filer
-- nor the worker can approve the report (segregation of duties).
-- Apply with psql / SQL Editor (NOT `supabase db push`). Run after pas_0040.

alter table pas.profiles add column if not exists can_file_for_others boolean not null default false;
alter table pas.expense_reports add column if not exists worker_id uuid references pas.profiles(id) on delete set null;
create index if not exists idx_expense_reports_worker on pas.expense_reports(worker_id);

create or replace function pas.can_file_for_others(uid uuid)
returns boolean as $$
  select coalesce((select can_file_for_others from pas.profiles where id = uid), false);
$$ language sql security definer set search_path = pas, pg_temp stable;

-- a person cannot give themselves the flag (the "member updates own profile" policy would allow it)
create or replace function pas.profiles_flag_guard()
returns trigger
language plpgsql security definer set search_path = pas, pg_temp as $$
begin
  if auth.uid() is not null
     and new.can_file_for_others is distinct from old.can_file_for_others
     and not pas.is_admin(auth.uid()) then
    raise exception 'Only an ADMIN can change this flag.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_flag_guard_upd on pas.profiles;
create trigger profiles_flag_guard_upd
  before update on pas.profiles
  for each row execute function pas.profiles_flag_guard();

-- the worker of a report is somebody else only if the filer carries the flag
create or replace function pas.expense_worker_guard()
returns trigger
language plpgsql security definer set search_path = pas, pg_temp as $$
begin
  if auth.uid() is null or current_setting('pas.bypass_guard', true) = '1' then
    return new;
  end if;
  if new.worker_id is not null
     and new.worker_id is distinct from new.requested_by
     and (tg_op = 'INSERT' or new.worker_id is distinct from old.worker_id)
     and not pas.can_file_for_others(auth.uid())
     and not pas.is_admin(auth.uid()) then
    raise exception 'You are not allowed to file an expense report for another person.';
  end if;
  return new;
end;
$$;

drop trigger if exists expense_worker_guard_trg on pas.expense_reports;
create trigger expense_worker_guard_trg
  before insert or update on pas.expense_reports
  for each row execute function pas.expense_worker_guard();

-- the worker sees the report
create or replace function pas.can_see_expense_report(rid uuid, uid uuid)
returns boolean as $$
  select pas.is_expense_viewer(uid)
      or exists (select 1 from pas.expense_reports where id = rid and (requested_by = uid or worker_id = uid))
      or exists (select 1 from pas.expense_approvals where report_id = rid and user_id = uid);
$$ language sql security definer set search_path = pas, pg_temp stable;

drop policy if exists "see own, assigned or all (administration)" on pas.expense_reports;
create policy "see own, assigned or all (administration)" on pas.expense_reports for select
  using (requested_by = auth.uid() or worker_id = auth.uid() or pas.can_see_expense_report(id, auth.uid()));

-- neither the filer nor the worker can approve
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

grant execute on function pas.can_file_for_others(uuid), pas.can_see_expense_report(uuid, uuid),
  pas.sign_expense_report(uuid, pas.app_role)
  to authenticated, service_role;
