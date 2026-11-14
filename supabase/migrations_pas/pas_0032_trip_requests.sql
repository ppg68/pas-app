-- PAS 0032: Trip requests (online "Scheda attivazione missioni" PR09_1.5_AA14 + "Autorizzazione trasferta"
-- PR09_1.6_AA08/AA09). One sheet for every trip (Italy, EU, extra EU; employee, Co.Co.Co, volunteer...).
--
-- Flow: any logged-in staff member files the sheet -> the PM / Programme Manager and the RAC or CAR approve
-- (a PM filing the request counts as PM approval) -> if the trip needs flights / visa / insurance / hotel,
-- Logistics (role LOG) is notified, records the booking and closes the sheet; otherwise the sheet closes
-- when the last approval is given. A PDF with every step is produced from the page.
--
--   pas.trip_requests    one request (number TR-26-001)
--   pas.trip_approvals   who must approve (PM, RAC) and when
--
-- Times come from the database. Requesters can edit / cancel only while nothing has been approved.
-- Nothing outside schema pas is touched. Apply with psql / SQL Editor (NOT `supabase db push`).

-- ============================================================ tables
create table if not exists pas.trip_requests (
  id uuid primary key default gen_random_uuid(),
  number text unique,                                    -- assigned by trigger: TR-26-001
  status text not null default 'pending' check (status in ('pending', 'approved', 'closed', 'cancelled')),

  requested_by uuid not null references pas.profiles(id),
  requester_name text not null,
  requester_email text,

  traveler_name text not null,
  traveler_email text,
  traveler_type text not null default 'employee'
    check (traveler_type in ('employee', 'cococo', 'volunteer', 'partner', 'other')),
  public_employee boolean not null default false,
  role_title text,

  scope text not null default 'eu' check (scope in ('italy', 'eu', 'extra_eu')),
  destination text not null,
  work_place text,
  start_date date not null,
  end_date date not null,

  project_title text,
  internal_code text,
  donor_code text,
  budget_line text,
  reference_person text,                                 -- who the traveler reports to
  activities text,
  objective text,
  minors boolean not null default false,

  transport text[] not null default '{}',                -- company_car / own_car / own_electric / public
  advance_amount numeric,
  compensation_charged boolean not null default false,   -- normal daily fee charged to a project
  compensation_bl text,

  lodging_mode text not null default 'none'
    check (lodging_mode in ('none', 'per_diem', 'receipts', 'free_lodging', 'self')),
  per_diem_rate numeric,
  per_diem_days numeric,
  per_diem_bl text,
  expenses_bl text,                                      -- budget line for receipts reimbursement

  flights_needed boolean not null default false,
  flights_route text,
  flights_bl text,
  visa_needed boolean not null default false,
  visa_bl text,
  insurance text not null default 'none' check (insurance in ('none', 'oikos', 'self')),
  insurance_bl text,
  hotel_needed boolean not null default false,           -- Oikos books accommodation / train
  tickets_note text,                                     -- what Logistics has to buy (train, hotel...)
  notes text,

  needs_logistics boolean not null default false,        -- true if flights / visa / insurance by Oikos / hotel

  booked_by uuid references pas.profiles(id),
  booked_by_name text,
  booked_at timestamptz,
  booking_note text,
  booking_total numeric,

  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (end_date >= start_date)
);

create index if not exists idx_trip_requests_requested_by on pas.trip_requests(requested_by);
create index if not exists idx_trip_requests_status on pas.trip_requests(status);

create table if not exists pas.trip_approvals (
  request_id uuid not null references pas.trip_requests(id) on delete cascade,
  signer_role pas.app_role not null check (signer_role in ('PM', 'RAC')),
  user_id uuid not null references pas.profiles(id) on delete cascade,
  user_name text not null,
  signed_at timestamptz,
  primary key (request_id, signer_role)
);

-- ============================================================ helpers (SECURITY DEFINER: no RLS recursion)
create or replace function pas.is_trip_viewer(uid uuid)
returns boolean as $$
  select exists (select 1 from pas.user_roles where user_id = uid and role in ('LOG', 'ADMIN', 'RAC', 'CAR', 'DG'));
$$ language sql security definer set search_path = pas, pg_temp stable;

create or replace function pas.can_see_trip_request(rid uuid, uid uuid)
returns boolean as $$
  select pas.is_trip_viewer(uid)
      or exists (select 1 from pas.trip_requests where id = rid and requested_by = uid)
      or exists (select 1 from pas.trip_approvals where request_id = rid and user_id = uid);
$$ language sql security definer set search_path = pas, pg_temp stable;

create or replace function pas.is_trip_request_owner(rid uuid, uid uuid)
returns boolean as $$
  select exists (select 1 from pas.trip_requests where id = rid and requested_by = uid);
$$ language sql security definer set search_path = pas, pg_temp stable;

create or replace function pas.trip_request_unsigned(rid uuid)
returns boolean as $$
  select not exists (select 1 from pas.trip_approvals where request_id = rid and signed_at is not null);
$$ language sql security definer set search_path = pas, pg_temp stable;

-- People holding a role (same function used by contract requests, with LOG added so that the
-- app can email Logistics once a trip is approved).
create or replace function pas.contract_role_holders(r pas.app_role)
returns table (id uuid, full_name text, email text) as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;
  if r not in ('PM', 'RAC', 'CAR', 'CONTRACTS', 'DG', 'LOG') then
    raise exception 'Role not available.';
  end if;
  return query
    select p.id, p.full_name, p.email
      from pas.user_roles ur
      join pas.profiles p on p.id = ur.user_id
     where ur.role = r
     order by p.full_name;
end;
$$ language plpgsql security definer set search_path = pas, pg_temp stable;

-- ============================================================ numbering (TR-YY-NNN, progressive per year)
create or replace function pas.assign_trip_request_number()
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
  perform pg_advisory_xact_lock(hashtext('pas.trip_request_number'));
  select coalesce(max((regexp_match(c.number, '^TR-' || yy || '-(\d+)$'))[1]::int), 0) + 1
    into n from pas.trip_requests c;
  new.number := 'TR-' || yy || '-' || lpad(n::text, 3, '0');
  return new;
end;
$$;

drop trigger if exists trip_requests_number on pas.trip_requests;
create trigger trip_requests_number
  before insert on pas.trip_requests
  for each row execute function pas.assign_trip_request_number();

-- ============================================================ guard on updates
create or replace function pas.trip_requests_guard()
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
  -- the requester: only the sheet fields, never number / owner / booking / closing, status only to cancel
  if new.number is distinct from old.number
     or new.requested_by is distinct from old.requested_by
     or new.booked_by is distinct from old.booked_by
     or new.booked_at is distinct from old.booked_at
     or new.booking_note is distinct from old.booking_note
     or new.booking_total is distinct from old.booking_total
     or new.closed_at is distinct from old.closed_at then
    raise exception 'These fields cannot be changed this way.';
  end if;
  if new.status is distinct from old.status and not (old.status = 'pending' and new.status = 'cancelled') then
    raise exception 'The status cannot be changed this way.';
  end if;
  return new;
end;
$$;

drop trigger if exists trip_requests_guard_upd on pas.trip_requests;
create trigger trip_requests_guard_upd
  before update on pas.trip_requests
  for each row execute function pas.trip_requests_guard();

-- ============================================================ RLS
alter table pas.trip_requests enable row level security;
alter table pas.trip_approvals enable row level security;

create policy "see own, assigned or all (logistics, admin, direction)" on pas.trip_requests for select
  using (requested_by = auth.uid() or pas.can_see_trip_request(id, auth.uid()));

create policy "any user files a trip request" on pas.trip_requests for insert
  with check (
    requested_by = auth.uid()
    and status = 'pending'
    and booked_by is null
    and closed_at is null
  );

create policy "requester edits until an approval is placed" on pas.trip_requests for update
  using (requested_by = auth.uid() and status = 'pending' and pas.trip_request_unsigned(id))
  with check (requested_by = auth.uid());

create policy "admin edits trip request" on pas.trip_requests for update
  using (pas.is_admin(auth.uid()))
  with check (pas.is_admin(auth.uid()));

create policy "requester deletes unsigned request" on pas.trip_requests for delete
  using (requested_by = auth.uid() and status = 'pending' and pas.trip_request_unsigned(id));

create policy "admin deletes trip request" on pas.trip_requests for delete
  using (pas.is_admin(auth.uid()));

create policy "see approvals of visible requests" on pas.trip_approvals for select
  using (pas.can_see_trip_request(request_id, auth.uid()));

create policy "requester designates approvers" on pas.trip_approvals for insert
  with check (pas.is_trip_request_owner(request_id, auth.uid()) and signed_at is null);

create policy "requester changes unsigned approvers" on pas.trip_approvals for update
  using (pas.is_trip_request_owner(request_id, auth.uid()) and signed_at is null)
  with check (pas.is_trip_request_owner(request_id, auth.uid()) and signed_at is null);

create policy "requester removes unsigned approvers" on pas.trip_approvals for delete
  using (pas.is_trip_request_owner(request_id, auth.uid()) and signed_at is null);

-- ============================================================ approving
create or replace function pas.sign_trip_request(rid uuid, as_role pas.app_role)
returns jsonb as $$
declare
  req pas.trip_requests%rowtype;
  ap pas.trip_approvals%rowtype;
  remaining int;
  final_status text;
begin
  select * into req from pas.trip_requests where id = rid for update;
  if not found then
    raise exception 'Trip request not found.';
  end if;
  if req.status <> 'pending' then
    raise exception 'This request is not awaiting approval.';
  end if;
  if as_role not in ('PM', 'RAC') then
    raise exception 'Only PM or RAC / CAR can approve a trip request.';
  end if;
  select * into ap from pas.trip_approvals where request_id = rid and signer_role = as_role;
  if not found or ap.user_id <> auth.uid() then
    raise exception 'You are not the designated approver for this role.';
  end if;
  if ap.signed_at is not null then
    raise exception 'Already approved.';
  end if;
  if auth.uid() = req.requested_by then
    raise exception 'Segregation of duties: the requester cannot approve their own request.';
  end if;
  if not exists (
    select 1 from pas.user_roles
     where user_id = auth.uid()
       and (role = as_role or (as_role = 'RAC' and role = 'CAR'))
  ) then
    raise exception 'You do not hold the role needed to approve (%).', case when as_role = 'RAC' then 'RAC or CAR' else as_role::text end;
  end if;

  update pas.trip_approvals set signed_at = now() where request_id = rid and signer_role = as_role;

  select count(*) into remaining from pas.trip_approvals where request_id = rid and signed_at is null;
  if remaining = 0 then
    final_status := case when req.needs_logistics then 'approved' else 'closed' end;
    perform set_config('pas.bypass_guard', '1', true);
    update pas.trip_requests
       set status = final_status,
           closed_at = case when final_status = 'closed' then now() else null end
     where id = rid;
  end if;

  return jsonb_build_object('all_signed', remaining = 0, 'needs_logistics', req.needs_logistics);
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

-- Logistics records the booking and closes the sheet.
create or replace function pas.book_trip_request(rid uuid, note text, total numeric)
returns void as $$
declare
  req pas.trip_requests%rowtype;
  who text;
begin
  select * into req from pas.trip_requests where id = rid for update;
  if not found then
    raise exception 'Trip request not found.';
  end if;
  if req.status <> 'approved' then
    raise exception 'The trip is not waiting for Logistics.';
  end if;
  if not exists (select 1 from pas.user_roles where user_id = auth.uid() and role in ('LOG', 'ADMIN')) then
    raise exception 'Only Logistics can record the booking.';
  end if;
  select full_name into who from pas.profiles where id = auth.uid();
  perform set_config('pas.bypass_guard', '1', true);
  update pas.trip_requests
     set status = 'closed',
         booked_by = auth.uid(),
         booked_by_name = who,
         booked_at = now(),
         booking_note = nullif(btrim(note), ''),
         booking_total = total,
         closed_at = now()
   where id = rid;
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

grant execute on function
  pas.is_trip_viewer(uuid), pas.can_see_trip_request(uuid, uuid), pas.is_trip_request_owner(uuid, uuid),
  pas.trip_request_unsigned(uuid), pas.contract_role_holders(pas.app_role),
  pas.sign_trip_request(uuid, pas.app_role), pas.book_trip_request(uuid, text, numeric)
  to authenticated, service_role;

grant select, insert, update, delete on pas.trip_requests to authenticated, service_role;
grant select, insert, update, delete on pas.trip_approvals to authenticated, service_role;
