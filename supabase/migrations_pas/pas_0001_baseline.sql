-- PAS — baseline (STRUCTURE ONLY) in the dedicated schema `pas`, for the shared Supabase
-- project OIKOS_DBP_GKSede_GKLoco_Rico.
--
-- Source of truth: final state of legacy migrations 0001..0024 (public schema of the old
-- PAS project), with these deliberate, security-driven differences (shared project:
-- every user of every app is `authenticated` here):
--   1. No trigger on auth.users. The profile is created lazily on first login via
--      pas.ensure_profile() (called from the dashboard layout).
--   2. Every policy that was only `auth.role() = 'authenticated'` now requires PAS
--      membership: pas.is_member(auth.uid()) = at least one row in pas.user_roles.
--      profiles: each user reads their own row; members read all profiles (needed to show
--      names on requests/signatures); ADMIN is a member, so reads all.
--   3. SECURITY DEFINER functions use `set search_path = pas, pg_temp`.
-- Nothing outside schema `pas` is created, altered or granted. No data is loaded here
-- (the historical imports live in supabase/archive_data_imports/).
-- Apply with psql (NOT `supabase db push`).

create schema if not exists pas;
grant usage on schema pas to anon, authenticated, service_role;
alter default privileges in schema pas grant all on tables to anon, authenticated, service_role;
alter default privileges in schema pas grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema pas grant all on functions to anon, authenticated, service_role;

-- ============================================================ enums
create type pas.app_role as enum ('BH','PM','LOG','CAR','RAC','DG','CONTRACTS','ADMIN');
create type pas.proc_code as enum ('DIR','SQ','3Q','SP','TEN');
create type pas.request_stage as enum ('request','ir_auth','offers','winner','documents','payment','completed');
create type pas.contract_status as enum ('in_corso','concluso','annullato');

-- ============================================================ tables
create table pas.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  created_at timestamptz not null default now()
);

create table pas.user_roles (
  user_id uuid not null references pas.profiles(id) on delete cascade,
  role pas.app_role not null,
  primary key (user_id, role)
);

create table pas.project_assignments (
  project_code text primary key,
  pm_user_id uuid references pas.profiles(id),
  car_user_id uuid references pas.profiles(id)
);

create table pas.hq_counter (
  id boolean primary key default true check (id),
  next_number int not null default 1
);
insert into pas.hq_counter (id, next_number) values (true, 1);

create table pas.requests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  country text not null,
  project_code text not null,
  budget_line text not null,
  description text not null,
  estimated_price numeric not null,
  currency text not null default 'EUR',
  proc_code pas.proc_code not null,
  derogation boolean not null default false,
  derogation_reason text,
  coordination_cost boolean not null default false,
  cup_code text,
  institutional_activity boolean not null default false,
  occasional_collaborator boolean not null default false,
  initiated_by uuid references pas.profiles(id),          -- nullable since 0017
  stage pas.request_stage not null default 'ir_auth',
  winner_offer_id uuid,
  winner_note text,
  folder_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_legacy boolean not null default false,               -- 0017
  legacy_ir_number text,
  legacy_initiator_name text,
  legacy_protocol text,
  legacy_note text
);

create table pas.offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references pas.requests(id) on delete cascade,
  supplier text not null,
  price numeric not null,
  created_at timestamptz not null default now()
);

alter table pas.requests
  add constraint fk_winner_offer foreign key (winner_offer_id) references pas.offers(id);

create table pas.signatures (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references pas.requests(id) on delete cascade,
  phase text not null check (phase in ('ir_auth','payment')),
  signer_role pas.app_role not null,
  signed_by uuid references pas.profiles(id),
  signed_at timestamptz,
  unique (request_id, phase, signer_role)
);

create table pas.request_documents (
  request_id uuid not null references pas.requests(id) on delete cascade,
  doc_key text not null,
  checked boolean not null default false,
  checked_by uuid references pas.profiles(id),
  checked_at timestamptz,
  primary key (request_id, doc_key)
);

create table pas.audit_log (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references pas.requests(id) on delete cascade,
  ts timestamptz not null default now(),
  user_id uuid references pas.profiles(id),
  role pas.app_role,
  action text not null
);

create table pas.request_approvers (
  request_id uuid not null references pas.requests(id) on delete cascade,
  signer_role pas.app_role not null,
  user_id uuid not null references pas.profiles(id) on delete cascade,
  notified_at timestamptz,
  primary key (request_id, signer_role)
);

create table pas.contracts (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  subject text not null,
  status pas.contract_status not null default 'in_corso',
  typology text,
  unit text,
  role_title text,
  activity text,
  country text,
  project_code text,
  ir_code text,
  contract_kind text,                                     -- text since 0009
  signed_date date,
  start_date date,
  end_date date,
  project_deadline date,
  currency text not null default 'EUR',
  amount numeric not null default 0,
  payment_terms text,
  signed boolean not null default false,
  privacy boolean not null default false,
  code_of_conduct boolean not null default false,
  psea_policy boolean not null default false,
  criminal_record_check boolean not null default false,
  technical_requirements_check boolean not null default false,
  labor_inspectorate_notice boolean not null default false,
  referent text,
  notes text,
  created_by uuid references pas.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table pas.contract_tranches (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references pas.contracts(id) on delete cascade,
  seq int not null default 1,
  label text,
  amount numeric not null default 0,
  due_date date,
  due_condition text,
  paid boolean not null default false,
  paid_date date,
  paid_amount numeric,
  notes text,
  created_at timestamptz not null default now()
);

create table pas.contract_invoices (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references pas.contracts(id) on delete set null,
  legacy_contract_id text not null,
  subject text,
  invoice_number text,
  invoice_date date,
  amount numeric not null default 0,
  protocol text,
  description text,
  paid_amount numeric,
  payment_date date,
  payment_note text,
  notes text,
  created_at timestamptz not null default now()
);

create table pas.invoices (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references pas.requests(id) on delete set null,
  contract_id uuid references pas.contracts(id) on delete set null,
  ir_number text,
  protocol text,
  contract_number text,
  supplier text,
  due_date date,
  payment_date date,
  payment_note text,
  currency text not null default 'EUR',
  amount numeric not null default 0,
  withholding numeric,
  pa_signed boolean not null default false,
  project_code text,
  budget_line text,
  cup text,
  contract_value numeric,
  balance_due numeric,
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================================ indexes
create index idx_contract_tranches_contract on pas.contract_tranches(contract_id);
create index idx_contract_invoices_contract on pas.contract_invoices(contract_id);
create index idx_contract_invoices_legacy on pas.contract_invoices(legacy_contract_id);
create index idx_invoices_request on pas.invoices(request_id);
create index idx_invoices_contract on pas.invoices(contract_id);

-- ============================================================ functions
-- Membership / role helpers. SECURITY DEFINER so that policies on user_roles can use
-- them without re-triggering RLS on their own inner query (see legacy 0005/0014/0022).
create or replace function pas.is_member(uid uuid)
returns boolean as $$
  select exists (select 1 from pas.user_roles where user_id = uid);
$$ language sql security definer set search_path = pas, pg_temp stable;

create or replace function pas.is_rac_or_car(uid uuid)
returns boolean as $$
  select exists (select 1 from pas.user_roles where user_id = uid and role in ('RAC', 'CAR'));
$$ language sql security definer set search_path = pas, pg_temp stable;

create or replace function pas.has_contracts_access(uid uuid)
returns boolean as $$
  select exists (select 1 from pas.user_roles where user_id = uid and role = 'CONTRACTS');
$$ language sql security definer set search_path = pas, pg_temp stable;

create or replace function pas.is_admin(uid uuid)
returns boolean as $$
  select exists (select 1 from pas.user_roles where user_id = uid and role = 'ADMIN');
$$ language sql security definer set search_path = pas, pg_temp stable;

-- Lazy profile creation (replaces the old trigger on auth.users). Only ever creates the
-- caller's own profile, taking name/email from auth.users, so they cannot be forged.
create or replace function pas.ensure_profile()
returns void as $$
begin
  insert into pas.profiles (id, full_name, email)
  select u.id,
         coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
         u.email
  from auth.users u
  where u.id = auth.uid()
  on conflict (id) do nothing;
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

-- IR (HQ) counter: row lock so two concurrent requests never get the same number.
-- Call via RPC in the same flow that inserts the request. Unchanged logic (0003).
create or replace function pas.next_hq_number()
returns int as $$
declare
  n int;
begin
  -- Shared project: other apps' users are also `authenticated`; only PAS members may draw numbers.
  if auth.uid() is not null and not pas.is_member(auth.uid()) then
    raise exception 'Not a PAS member';
  end if;
  select next_number into n from pas.hq_counter where id = true for update;
  update pas.hq_counter set next_number = n + 1 where id = true;
  return n;
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

-- PR04: whoever initiated a request cannot sign its IR approval or payment.
create or replace function pas.enforce_segregation_of_duties()
returns trigger as $$
declare
  req pas.requests%rowtype;
begin
  select * into req from pas.requests where id = new.request_id;
  if new.signed_by is not null and new.signed_by = req.initiated_by then
    raise exception 'Segregation of duties: whoever created the request cannot sign it (PR04)';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

create trigger trg_segregation_of_duties
  before insert or update on pas.signatures
  for each row
  execute function pas.enforce_segregation_of_duties();

-- Function privileges: the default privileges above would grant execute to anon on every
-- new function, so reset and grant explicitly.
revoke execute on all functions in schema pas from public, anon, authenticated, service_role;
grant execute on function pas.is_member(uuid), pas.is_rac_or_car(uuid),
  pas.has_contracts_access(uuid), pas.is_admin(uuid)
  to anon, authenticated, service_role;
grant execute on function pas.ensure_profile() to authenticated, service_role;
grant execute on function pas.next_hq_number() to authenticated, service_role;

-- ============================================================ RLS
alter table pas.profiles enable row level security;
alter table pas.user_roles enable row level security;
alter table pas.project_assignments enable row level security;
alter table pas.hq_counter enable row level security;
alter table pas.requests enable row level security;
alter table pas.offers enable row level security;
alter table pas.signatures enable row level security;
alter table pas.request_documents enable row level security;
alter table pas.audit_log enable row level security;
alter table pas.request_approvers enable row level security;
alter table pas.contracts enable row level security;
alter table pas.contract_tranches enable row level security;
alter table pas.contract_invoices enable row level security;
alter table pas.invoices enable row level security;

-- profiles
create policy "read own or member profiles" on pas.profiles for select
  using (id = auth.uid() or pas.is_member(auth.uid()));
create policy "member updates own profile" on pas.profiles for update
  using (id = auth.uid() and pas.is_member(auth.uid()));

-- user_roles (hq_counter: no policy on purpose, only next_hq_number() touches it)
create policy "member reads roles" on pas.user_roles for select
  using (pas.is_member(auth.uid()));
create policy "ADMIN manages roles" on pas.user_roles for all
  using (pas.is_admin(auth.uid()))
  with check (pas.is_admin(auth.uid()));
create policy "CONTRACTS role self-manages contracts access" on pas.user_roles for all
  using (role = 'CONTRACTS' and pas.has_contracts_access(auth.uid()))
  with check (role = 'CONTRACTS' and pas.has_contracts_access(auth.uid()));

-- project_assignments
create policy "member reads assignments" on pas.project_assignments for select
  using (pas.is_member(auth.uid()));
create policy "RAC/CAR manage assignments" on pas.project_assignments for all
  using (pas.is_rac_or_car(auth.uid()));

-- requests
create policy "member reads requests" on pas.requests for select
  using (pas.is_member(auth.uid()));
create policy "BH creates requests" on pas.requests for insert
  with check (
    initiated_by = auth.uid()
    and exists (select 1 from pas.user_roles where user_id = auth.uid() and role = 'BH')
  );
create policy "PM/LOG/CAR/RAC update requests" on pas.requests for update
  using (exists (select 1 from pas.user_roles where user_id = auth.uid() and role in ('PM','LOG','CAR','RAC')));
create policy "ADMIN deletes requests" on pas.requests for delete
  using (pas.is_admin(auth.uid()));

-- offers
create policy "member reads offers" on pas.offers for select
  using (pas.is_member(auth.uid()));
create policy "PM/LOG/CAR manage offers" on pas.offers for all
  using (exists (select 1 from pas.user_roles where user_id = auth.uid() and role in ('PM','LOG','CAR')));

-- signatures
create policy "member reads signatures" on pas.signatures for select
  using (pas.is_member(auth.uid()));
create policy "role holder signs" on pas.signatures for insert
  with check (exists (select 1 from pas.user_roles where user_id = auth.uid() and role = signer_role));
create policy "role holder updates own signature" on pas.signatures for update
  using (exists (select 1 from pas.user_roles where user_id = auth.uid() and role = signer_role));

-- request_documents
create policy "member reads docs" on pas.request_documents for select
  using (pas.is_member(auth.uid()));
create policy "PM/LOG/CAR update documents" on pas.request_documents for all
  using (exists (select 1 from pas.user_roles where user_id = auth.uid() and role in ('PM','LOG','CAR')));

-- audit_log
create policy "member reads audit" on pas.audit_log for select
  using (pas.is_member(auth.uid()));

-- request_approvers
create policy "member reads approvers" on pas.request_approvers for select
  using (pas.is_member(auth.uid()));
create policy "creator sets approvers" on pas.request_approvers for insert
  with check (exists (select 1 from pas.requests r where r.id = request_id and r.initiated_by = auth.uid()));
create policy "creator updates approvers" on pas.request_approvers for update
  using (exists (select 1 from pas.requests r where r.id = request_id and r.initiated_by = auth.uid()));

-- contracts module: CONTRACTS role only (already membership-based)
create policy "CONTRACTS role reads contracts" on pas.contracts for select
  using (pas.has_contracts_access(auth.uid()));
create policy "CONTRACTS role manages contracts" on pas.contracts for all
  using (pas.has_contracts_access(auth.uid()))
  with check (pas.has_contracts_access(auth.uid()));

create policy "CONTRACTS role reads tranches" on pas.contract_tranches for select
  using (pas.has_contracts_access(auth.uid()));
create policy "CONTRACTS role manages tranches" on pas.contract_tranches for all
  using (pas.has_contracts_access(auth.uid()))
  with check (pas.has_contracts_access(auth.uid()));

create policy "CONTRACTS role reads invoices" on pas.contract_invoices for select
  using (pas.has_contracts_access(auth.uid()));
create policy "CONTRACTS role manages invoices" on pas.contract_invoices for all
  using (pas.has_contracts_access(auth.uid()))
  with check (pas.has_contracts_access(auth.uid()));

create policy "CONTRACTS role reads invoices (IR)" on pas.invoices for select
  using (pas.has_contracts_access(auth.uid()));
create policy "CONTRACTS role manages invoices (IR)" on pas.invoices for all
  using (pas.has_contracts_access(auth.uid()))
  with check (pas.has_contracts_access(auth.uid()));

-- ============================================================ table grants
-- Tables created above already inherit the default privileges set at the top of this file
-- (all to anon/authenticated/service_role); RLS is what actually gates access. The anon
-- role has no policy anywhere, so it can read/write nothing.
