-- PAS 0018: Contract requests (online "Scheda attivazione contratto prestatori autonomi", PR09_1.5_AA14).
--
-- Replaces the Word form: any Oikos staff member (a logged-in user, no PAS role needed) fills in the
-- request; the designated PM / Programme Manager and RAC approve it; CONTRACTS (Elisa) then edits the
-- contract text generated from the template (individual or company) and downloads it as Word.
--
--   pas.contract_requests   one request (kind 'person' | 'company'); contract_text = editable articles
--   pas.contract_approvals  who must sign (PM, RAC) and when they signed
--
-- Approval time comes from the database (pas.sign_contract_request). Requesters can edit / cancel only
-- while nothing has been signed; CONTRACTS and ADMIN can edit at any time (contract text, linking).
-- Nothing outside schema pas is touched. Apply with psql / SQL Editor (NOT `supabase db push`).

-- ============================================================ tables
create table if not exists pas.contract_requests (
  id uuid primary key default gen_random_uuid(),
  number text unique,                                    -- assigned by trigger: SC-26-001
  kind text not null check (kind in ('person', 'company')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'cancelled')),

  requested_by uuid not null references pas.profiles(id),
  requester_name text not null,
  requester_email text,

  ir_code text,                                          -- IR number of the purchase procedure, if any
  proc_type text,                                        -- DIR / SQ / 3Q / SP / TEN

  party_name text not null,                              -- person: "Name Surname"; company: legal name
  party_short text,                                      -- company short name used in the text
  nationality text,
  address text,
  tax_code text,
  vat_number text,
  email text,
  pec text,
  legal_rep text,                                        -- company legal representative
  legal_rep_role text,
  contact_person text,                                   -- company contact for communications
  contact_email text,
  contact_email_admin text,

  contract_type text not null default 'consultancy_vat'
    check (contract_type in ('consultancy_vat', 'occasional')),
  start_on_signature boolean not null default false,
  start_date date,
  end_date date,

  project_title text,
  donor_code text,
  internal_code text,
  budget_line text,
  role_title text,
  staff_like boolean not null default false,             -- assimilabile a STAFF (to enter in Geco)
  activities text,
  objective text,
  minors boolean not null default false,
  work_place text,

  amount numeric not null default 0,
  currency text not null default 'EUR',
  fee_mode text not null default 'total' check (fee_mode in ('daily', 'total')),
  fee_note text,                                         -- e.g. "220 EUR/day + VAT"
  payment_terms text,

  data jsonb not null default '{}'::jsonb,               -- other scheda fields (reimbursements, flights, insurance, ...)

  contract_text jsonb,                                   -- [{key,title,body}] editable articles; null until generated
  contract_generated_at timestamptz,
  contract_id uuid references pas.contracts(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contract_requests_requested_by on pas.contract_requests(requested_by);
create index if not exists idx_contract_requests_status on pas.contract_requests(status);

create table if not exists pas.contract_approvals (
  request_id uuid not null references pas.contract_requests(id) on delete cascade,
  signer_role pas.app_role not null check (signer_role in ('PM', 'RAC')),
  user_id uuid not null references pas.profiles(id) on delete cascade,
  user_name text not null,
  signed_at timestamptz,
  primary key (request_id, signer_role)
);

-- ============================================================ helpers (SECURITY DEFINER: no RLS recursion)
create or replace function pas.is_contract_viewer(uid uuid)
returns boolean as $$
  select exists (select 1 from pas.user_roles where user_id = uid and role in ('CONTRACTS', 'ADMIN', 'RAC', 'DG'));
$$ language sql security definer set search_path = pas, pg_temp stable;

create or replace function pas.is_contract_editor(uid uuid)
returns boolean as $$
  select exists (select 1 from pas.user_roles where user_id = uid and role in ('CONTRACTS', 'ADMIN'));
$$ language sql security definer set search_path = pas, pg_temp stable;

create or replace function pas.is_contract_request_owner(rid uuid, uid uuid)
returns boolean as $$
  select exists (select 1 from pas.contract_requests where id = rid and requested_by = uid);
$$ language sql security definer set search_path = pas, pg_temp stable;

create or replace function pas.can_see_contract_request(rid uuid, uid uuid)
returns boolean as $$
  select pas.is_contract_viewer(uid)
      or exists (select 1 from pas.contract_requests where id = rid and requested_by = uid)
      or exists (select 1 from pas.contract_approvals where request_id = rid and user_id = uid);
$$ language sql security definer set search_path = pas, pg_temp stable;

create or replace function pas.contract_request_unsigned(rid uuid)
returns boolean as $$
  select not exists (select 1 from pas.contract_approvals where request_id = rid and signed_at is not null);
$$ language sql security definer set search_path = pas, pg_temp stable;

-- People holding a role, so that any staff member can pick the approvers (profiles / user_roles are not
-- readable by non-members). Only the roles involved in contract requests are exposed.
create or replace function pas.contract_role_holders(r pas.app_role)
returns table (id uuid, full_name text, email text) as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;
  if r not in ('PM', 'RAC', 'CONTRACTS', 'DG') then
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

-- ============================================================ numbering (SC-YY-NNN, progressive per year)
create or replace function pas.assign_contract_request_number()
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
  perform pg_advisory_xact_lock(hashtext('pas.contract_request_number'));
  select coalesce(max((regexp_match(c.number, '^SC-' || yy || '-(\d+)$'))[1]::int), 0) + 1
    into n from pas.contract_requests c;
  new.number := 'SC-' || yy || '-' || lpad(n::text, 3, '0');
  return new;
end;
$$;

drop trigger if exists contract_requests_number on pas.contract_requests;
create trigger contract_requests_number
  before insert on pas.contract_requests
  for each row execute function pas.assign_contract_request_number();

-- ============================================================ guard on updates
create or replace function pas.contract_requests_guard()
returns trigger
language plpgsql security definer set search_path = pas, pg_temp as $$
begin
  new.updated_at := now();
  if auth.uid() is null or current_setting('pas.bypass_guard', true) = '1' then
    return new;
  end if;
  if pas.is_contract_editor(auth.uid()) then
    return new;
  end if;
  -- the requester: only the scheda fields, never number / owner / contract text / link / status (except cancel)
  if new.number is distinct from old.number
     or new.requested_by is distinct from old.requested_by
     or new.contract_text is distinct from old.contract_text
     or new.contract_generated_at is distinct from old.contract_generated_at
     or new.contract_id is distinct from old.contract_id then
    raise exception 'These fields can only be changed by Contracts.';
  end if;
  if new.status is distinct from old.status and not (old.status = 'pending' and new.status = 'cancelled') then
    raise exception 'The status cannot be changed this way.';
  end if;
  return new;
end;
$$;

drop trigger if exists contract_requests_guard_upd on pas.contract_requests;
create trigger contract_requests_guard_upd
  before update on pas.contract_requests
  for each row execute function pas.contract_requests_guard();

-- ============================================================ RLS
alter table pas.contract_requests enable row level security;
alter table pas.contract_approvals enable row level security;

create policy "see own, assigned or all (contracts staff)" on pas.contract_requests for select
  using (requested_by = auth.uid() or pas.can_see_contract_request(id, auth.uid()));
  -- (the direct requested_by test matters: INSERT ... RETURNING must see the new row, which a function
  -- reading the table through an older snapshot would not)

create policy "any user files a contract request" on pas.contract_requests for insert
  with check (
    requested_by = auth.uid()
    and status = 'pending'
    and contract_text is null
    and contract_id is null
  );

create policy "requester edits until a signature is placed" on pas.contract_requests for update
  using (requested_by = auth.uid() and status = 'pending' and pas.contract_request_unsigned(id))
  with check (requested_by = auth.uid());

create policy "contracts staff edit" on pas.contract_requests for update
  using (pas.is_contract_editor(auth.uid()))
  with check (pas.is_contract_editor(auth.uid()));

create policy "requester deletes unsigned request" on pas.contract_requests for delete
  using (requested_by = auth.uid() and status = 'pending' and pas.contract_request_unsigned(id));

create policy "admin deletes contract request" on pas.contract_requests for delete
  using (pas.is_admin(auth.uid()));

create policy "see approvals of visible requests" on pas.contract_approvals for select
  using (pas.can_see_contract_request(request_id, auth.uid()));

create policy "requester designates approvers" on pas.contract_approvals for insert
  with check (pas.is_contract_request_owner(request_id, auth.uid()) and signed_at is null);

create policy "requester changes unsigned approvers" on pas.contract_approvals for update
  using (pas.is_contract_request_owner(request_id, auth.uid()) and signed_at is null)
  with check (pas.is_contract_request_owner(request_id, auth.uid()) and signed_at is null);

create policy "requester removes unsigned approvers" on pas.contract_approvals for delete
  using (pas.is_contract_request_owner(request_id, auth.uid()) and signed_at is null);

-- ============================================================ signing
create or replace function pas.sign_contract_request(rid uuid, as_role pas.app_role)
returns jsonb as $$
declare
  req pas.contract_requests%rowtype;
  ap pas.contract_approvals%rowtype;
  remaining int;
begin
  select * into req from pas.contract_requests where id = rid for update;
  if not found then
    raise exception 'Contract request not found.';
  end if;
  if req.status <> 'pending' then
    raise exception 'This request is not awaiting approval.';
  end if;
  if as_role not in ('PM', 'RAC') then
    raise exception 'Only PM or RAC can approve a contract request.';
  end if;
  select * into ap from pas.contract_approvals where request_id = rid and signer_role = as_role;
  if not found or ap.user_id <> auth.uid() then
    raise exception 'You are not the designated approver for this role.';
  end if;
  if ap.signed_at is not null then
    raise exception 'Already approved.';
  end if;
  if auth.uid() = req.requested_by then
    raise exception 'Segregation of duties: the requester cannot approve their own request.';
  end if;
  if not exists (select 1 from pas.user_roles where user_id = auth.uid() and role = as_role) then
    raise exception 'You do not hold the role %.', as_role;
  end if;

  update pas.contract_approvals set signed_at = now() where request_id = rid and signer_role = as_role;

  select count(*) into remaining from pas.contract_approvals where request_id = rid and signed_at is null;
  if remaining = 0 then
    perform set_config('pas.bypass_guard', '1', true);
    update pas.contract_requests set status = 'approved' where id = rid;
  end if;

  return jsonb_build_object('all_signed', remaining = 0);
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

grant execute on function
  pas.is_contract_viewer(uuid), pas.is_contract_editor(uuid), pas.is_contract_request_owner(uuid, uuid),
  pas.can_see_contract_request(uuid, uuid), pas.contract_request_unsigned(uuid),
  pas.contract_role_holders(pas.app_role), pas.sign_contract_request(uuid, pas.app_role)
  to authenticated, service_role;

grant select, insert, update, delete on pas.contract_requests to authenticated, service_role;
grant select, insert, update, delete on pas.contract_approvals to authenticated, service_role;
