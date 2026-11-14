-- PAS 0033: Expense reports (online "Expenses Reimbursement Form" PR09_1.6_AA06/AA09).
--
-- Flow: any logged-in staff member fills the report (mileage 11.10.01, transport 11.10.02, meals and
-- hotels 11.10.03, equipment and other costs 11.10.04, invoices addressed to Oikos) and uploads the receipts ->
-- the PM / Programme Manager and the RAC or CAR approve (a PM filing the report counts as PM approval) ->
-- the administration (CAR / RAC / ADMIN) records it in Callisto with the accounting protocol and the sheet
-- closes. A PDF with every step is produced from the page.
--
--   pas.expense_reports    one report (number NS-26-001), optional link to a trip (pas.trip_requests)
--   pas.expense_lines      the expense rows, one per receipt, by section
--   pas.expense_approvals  who must approve (PM, RAC) and when
--   pas.expense_files      the receipts (private bucket pas-request-files, path expenses/<report>/...)
--
-- Times come from the database. The requester can edit / cancel only while nothing has been approved.
-- Nothing outside schema pas is touched except the Storage policies for the new path.
-- Apply with psql / SQL Editor (NOT `supabase db push`). Run after pas_0032.

-- ============================================================ tables
create table if not exists pas.expense_reports (
  id uuid primary key default gen_random_uuid(),
  number text unique,                                    -- assigned by trigger: NS-26-001
  status text not null default 'pending' check (status in ('pending', 'approved', 'registered', 'cancelled')),

  requested_by uuid not null references pas.profiles(id),
  requester_name text not null,
  requester_email text,

  worker_name text not null,
  subject text not null,                                 -- object of the expenses
  donor_code text,
  internal_code text,
  trip_id uuid references pas.trip_requests(id) on delete set null,
  car_model text,
  fuel text,
  notes text,
  total_eur numeric not null default 0,

  callisto_protocol text,                                -- accounting protocol, set when recorded
  registered_by uuid references pas.profiles(id),
  registered_by_name text,
  registered_at timestamptz,
  registration_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_expense_reports_requested_by on pas.expense_reports(requested_by);
create index if not exists idx_expense_reports_status on pas.expense_reports(status);
create index if not exists idx_expense_reports_trip on pas.expense_reports(trip_id);

create table if not exists pas.expense_lines (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references pas.expense_reports(id) on delete cascade,
  section text not null check (section in ('km', 'transport', 'meals', 'equipment', 'invoices')),
  seq int not null default 1,
  line_date date,
  budget_line text,
  location text,
  motive text,
  km numeric,                                            -- section km
  fuel_price numeric,                                    -- ACI fuel cost per litre (section km)
  currency text not null default 'EUR',
  amount_orig numeric,                                   -- amount in the receipt currency (not km)
  exchange_rate numeric,                                 -- foreign units per 1 EUR (InforEuro), if currency <> EUR
  amount_eur numeric not null default 0
);

create index if not exists idx_expense_lines_report on pas.expense_lines(report_id);

create table if not exists pas.expense_approvals (
  report_id uuid not null references pas.expense_reports(id) on delete cascade,
  signer_role pas.app_role not null check (signer_role in ('PM', 'RAC')),
  user_id uuid not null references pas.profiles(id) on delete cascade,
  user_name text not null,
  signed_at timestamptz,
  primary key (report_id, signer_role)
);

create table if not exists pas.expense_files (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references pas.expense_reports(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  size_bytes bigint not null,
  mime_type text,
  budget_line text,                                      -- receipts are grouped by budget line
  uploaded_by uuid references pas.profiles(id),
  uploaded_at timestamptz not null default now()
);

create index if not exists idx_expense_files_report on pas.expense_files(report_id);

-- ============================================================ helpers (SECURITY DEFINER: no RLS recursion)
create or replace function pas.is_expense_viewer(uid uuid)
returns boolean as $$
  select exists (select 1 from pas.user_roles where user_id = uid and role in ('ADMIN', 'RAC', 'CAR', 'DG'));
$$ language sql security definer set search_path = pas, pg_temp stable;

create or replace function pas.can_see_expense_report(rid uuid, uid uuid)
returns boolean as $$
  select pas.is_expense_viewer(uid)
      or exists (select 1 from pas.expense_reports where id = rid and requested_by = uid)
      or exists (select 1 from pas.expense_approvals where report_id = rid and user_id = uid);
$$ language sql security definer set search_path = pas, pg_temp stable;

create or replace function pas.is_expense_report_owner(rid uuid, uid uuid)
returns boolean as $$
  select exists (select 1 from pas.expense_reports where id = rid and requested_by = uid);
$$ language sql security definer set search_path = pas, pg_temp stable;

create or replace function pas.expense_report_editable(rid uuid)
returns boolean as $$
  select exists (select 1 from pas.expense_reports where id = rid and status = 'pending')
     and not exists (select 1 from pas.expense_approvals where report_id = rid and signed_at is not null);
$$ language sql security definer set search_path = pas, pg_temp stable;

-- ============================================================ numbering (NS-YY-NNN, progressive per year)
create or replace function pas.assign_expense_report_number()
returns trigger
language plpgsql security definer set search_path = pas, pg_temp as $$
declare
  yy text;
  n  int;
begin
  if new.number is not null and btrim(new.number) <> '' then
    return new;
  end if;
  yy := lpad((extract(year from current_date)::int % 100)::text, 2, '0');
  perform pg_advisory_xact_lock(hashtext('pas.expense_report_number'));
  select coalesce(max((regexp_match(c.number, '^NS-' || yy || '-(\d+)$'))[1]::int), 0) + 1
    into n from pas.expense_reports c;
  new.number := 'NS-' || yy || '-' || lpad(n::text, 3, '0');
  return new;
end;
$$;

drop trigger if exists expense_reports_number on pas.expense_reports;
create trigger expense_reports_number
  before insert on pas.expense_reports
  for each row execute function pas.assign_expense_report_number();

-- ============================================================ guard on updates
create or replace function pas.expense_reports_guard()
returns trigger
language plpgsql security definer set search_path = pas, pg_temp as $$
begin
  new.updated_at := now();
  if auth.uid() is null or current_setting('pas.bypass_guard', true) = '1' then
    return new;
  end if;
  if pas.is_admin(auth.uid()) then
    return new;
  end if;
  -- the requester: only the report fields, never number / owner / registration, status only to cancel
  if new.number is distinct from old.number
     or new.requested_by is distinct from old.requested_by
     or new.callisto_protocol is distinct from old.callisto_protocol
     or new.registered_by is distinct from old.registered_by
     or new.registered_at is distinct from old.registered_at
     or new.registration_note is distinct from old.registration_note then
    raise exception 'These fields cannot be changed this way.';
  end if;
  if new.status is distinct from old.status and not (old.status = 'pending' and new.status = 'cancelled') then
    raise exception 'The status cannot be changed this way.';
  end if;
  return new;
end;
$$;

drop trigger if exists expense_reports_guard_upd on pas.expense_reports;
create trigger expense_reports_guard_upd
  before update on pas.expense_reports
  for each row execute function pas.expense_reports_guard();

-- ============================================================ RLS
alter table pas.expense_reports enable row level security;
alter table pas.expense_lines enable row level security;
alter table pas.expense_approvals enable row level security;
alter table pas.expense_files enable row level security;

create policy "see own, assigned or all (administration)" on pas.expense_reports for select
  using (requested_by = auth.uid() or pas.can_see_expense_report(id, auth.uid()));

create policy "any user files an expense report" on pas.expense_reports for insert
  with check (
    requested_by = auth.uid()
    and status = 'pending'
    and callisto_protocol is null
    and registered_at is null
  );

create policy "requester edits until an approval is placed" on pas.expense_reports for update
  using (requested_by = auth.uid() and status = 'pending' and pas.expense_report_editable(id))
  with check (requested_by = auth.uid());

create policy "admin edits expense report" on pas.expense_reports for update
  using (pas.is_admin(auth.uid()))
  with check (pas.is_admin(auth.uid()));

create policy "requester deletes unsigned report" on pas.expense_reports for delete
  using (requested_by = auth.uid() and status = 'pending' and pas.expense_report_editable(id));

create policy "admin deletes expense report" on pas.expense_reports for delete
  using (pas.is_admin(auth.uid()));

-- lines
create policy "see lines of visible reports" on pas.expense_lines for select
  using (pas.can_see_expense_report(report_id, auth.uid()));
create policy "requester writes lines while editable" on pas.expense_lines for insert
  with check (pas.is_expense_report_owner(report_id, auth.uid()) and pas.expense_report_editable(report_id));
create policy "requester updates lines while editable" on pas.expense_lines for update
  using (pas.is_expense_report_owner(report_id, auth.uid()) and pas.expense_report_editable(report_id))
  with check (pas.is_expense_report_owner(report_id, auth.uid()) and pas.expense_report_editable(report_id));
create policy "requester deletes lines while editable" on pas.expense_lines for delete
  using (pas.is_expense_report_owner(report_id, auth.uid()) and pas.expense_report_editable(report_id));
create policy "admin manages lines" on pas.expense_lines for all
  using (pas.is_admin(auth.uid())) with check (pas.is_admin(auth.uid()));

-- approvals
create policy "see approvals of visible reports" on pas.expense_approvals for select
  using (pas.can_see_expense_report(report_id, auth.uid()));
create policy "requester designates approvers" on pas.expense_approvals for insert
  with check (pas.is_expense_report_owner(report_id, auth.uid()) and signed_at is null);
create policy "requester changes unsigned approvers" on pas.expense_approvals for update
  using (pas.is_expense_report_owner(report_id, auth.uid()) and signed_at is null)
  with check (pas.is_expense_report_owner(report_id, auth.uid()) and signed_at is null);
create policy "requester removes unsigned approvers" on pas.expense_approvals for delete
  using (pas.is_expense_report_owner(report_id, auth.uid()) and signed_at is null);

-- files (receipts): the requester adds / removes them while the report can still be edited
create policy "see files of visible reports" on pas.expense_files for select
  using (pas.can_see_expense_report(report_id, auth.uid()));
create policy "requester adds receipts" on pas.expense_files for insert
  with check (
    uploaded_by = auth.uid()
    and pas.is_expense_report_owner(report_id, auth.uid())
    and exists (select 1 from pas.expense_reports r where r.id = report_id and r.status in ('pending', 'approved'))
  );
create policy "requester removes receipts while editable" on pas.expense_files for delete
  using (pas.is_expense_report_owner(report_id, auth.uid()) and pas.expense_report_editable(report_id));
create policy "admin removes receipts" on pas.expense_files for delete
  using (pas.is_admin(auth.uid()));

-- ============================================================ approving
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
    raise exception 'Only PM or RAC / CAR can approve an expense report.';
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
  if not exists (
    select 1 from pas.user_roles
     where user_id = auth.uid()
       and (role = as_role or (as_role = 'RAC' and role = 'CAR'))
  ) then
    raise exception 'You do not hold the role needed to approve (%).', case when as_role = 'RAC' then 'RAC or CAR' else as_role::text end;
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

-- The administration records the report in Callisto (accounting protocol) and closes it.
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
    raise exception 'The report is not waiting to be recorded.';
  end if;
  if not exists (select 1 from pas.user_roles where user_id = auth.uid() and role in ('CAR', 'RAC', 'ADMIN')) then
    raise exception 'Only the administration (CAR / RAC) can record the report in Callisto.';
  end if;
  if protocol is null or btrim(protocol) = '' then
    raise exception 'Enter the accounting protocol.';
  end if;
  select full_name into who from pas.profiles where id = auth.uid();
  perform set_config('pas.bypass_guard', '1', true);
  update pas.expense_reports
     set status = 'registered',
         callisto_protocol = btrim(protocol),
         registered_by = auth.uid(),
         registered_by_name = who,
         registered_at = now(),
         registration_note = nullif(btrim(note), '')
   where id = rid;
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

grant execute on function
  pas.is_expense_viewer(uuid), pas.can_see_expense_report(uuid, uuid), pas.is_expense_report_owner(uuid, uuid),
  pas.expense_report_editable(uuid), pas.sign_expense_report(uuid, pas.app_role),
  pas.register_expense_report(uuid, text, text)
  to authenticated, service_role;

grant select, insert, update, delete on pas.expense_reports to authenticated, service_role;
grant select, insert, update, delete on pas.expense_lines to authenticated, service_role;
grant select, insert, update, delete on pas.expense_approvals to authenticated, service_role;
grant select, insert, update, delete on pas.expense_files to authenticated, service_role;

-- ============================================================ Storage (same private bucket, path expenses/<report>/<file>)
create policy "pas_expense_upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pas-request-files'
    and split_part(name, '/', 1) = 'expenses'
    and exists (select 1 from pas.expense_reports r
                 where r.id::text = split_part(name, '/', 2) and r.requested_by = auth.uid())
  );

create policy "pas_expense_read" on storage.objects for select to authenticated
  using (bucket_id = 'pas-request-files'
         and exists (select 1 from pas.expense_files f where f.storage_path = name));
