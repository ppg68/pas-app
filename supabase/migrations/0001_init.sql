-- PAS — initial schema
-- Mirrors the state shape of pas_prototype.html, but moves segregation-of-duties
-- and role checks into the database (RLS + trigger) instead of client-side alert().

create extension if not exists "pgcrypto";

create type app_role as enum ('BH','PM','LOG','CAR','RAC','DG');
create type proc_code as enum ('DIR','SQ','3Q','SP','TEN');
create type request_stage as enum ('request','ir_auth','offers','winner','documents','payment','completed');

-- One row per authenticated user (name/email replace the prototype's free-text currentUser).
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  created_at timestamptz not null default now()
);

-- A person can hold several roles at once (mirrors prototype's team[].roles, per-person not global).
create table user_roles (
  user_id uuid not null references profiles(id) on delete cascade,
  role app_role not null,
  primary key (user_id, role)
);

-- Per-project PM/CAR assignment, used to resolve who gets notified.
create table project_assignments (
  project_code text primary key,
  pm_user_id uuid references profiles(id),
  car_user_id uuid references profiles(id)
);

-- Global HQ IR counter (Italy). Update via a transaction with SELECT ... FOR UPDATE
-- to avoid two people getting the same number at once.
create table hq_counter (
  id boolean primary key default true check (id),
  next_number int not null default 1
);
insert into hq_counter (id, next_number) values (true, 1);

create table requests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  country text not null,
  project_code text not null,
  budget_line text not null,
  description text not null,
  estimated_price numeric not null,
  currency text not null default 'EUR',
  proc_code proc_code not null,
  derogation boolean not null default false,
  derogation_reason text,
  coordination_cost boolean not null default false,
  cup_code text,
  institutional_activity boolean not null default false,
  occasional_collaborator boolean not null default false,
  initiated_by uuid not null references profiles(id),
  stage request_stage not null default 'ir_auth',
  winner_offer_id uuid,
  winner_note text,
  folder_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  supplier text not null,
  price numeric not null,
  created_at timestamptz not null default now()
);

alter table requests
  add constraint fk_winner_offer foreign key (winner_offer_id) references offers(id);

-- One row per required signature — covers both IR approval (phase='ir_auth') and
-- payment authorization (phase='payment'). signed_by/signed_at null = not signed yet.
create table signatures (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  phase text not null check (phase in ('ir_auth','payment')),
  signer_role app_role not null,
  signed_by uuid references profiles(id),
  signed_at timestamptz,
  unique (request_id, phase, signer_role)
);

create table request_documents (
  request_id uuid not null references requests(id) on delete cascade,
  doc_key text not null, -- '01'..'10', see FOLDER_NAMES in lib/domain/procedures.ts
  checked boolean not null default false,
  checked_by uuid references profiles(id),
  checked_at timestamptz,
  primary key (request_id, doc_key)
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  ts timestamptz not null default now(),
  user_id uuid references profiles(id),
  role app_role,
  action text not null
);

-- === Segregation of duties, enforced in the database ===
-- PR04: whoever initiated a request cannot sign its IR approval or payment.
create or replace function enforce_segregation_of_duties()
returns trigger as $$
declare
  req requests%rowtype;
begin
  select * into req from requests where id = new.request_id;
  if new.signed_by is not null and new.signed_by = req.initiated_by then
    raise exception 'Segregation of duties: whoever created the request cannot sign it (PR04)';
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_segregation_of_duties
  before insert or update on signatures
  for each row
  execute function enforce_segregation_of_duties();

-- === Row Level Security ===
alter table requests enable row level security;
alter table offers enable row level security;
alter table signatures enable row level security;
alter table request_documents enable row level security;
alter table audit_log enable row level security;
alter table user_roles enable row level security;
alter table project_assignments enable row level security;

-- Starting point: any authenticated user can read everything (mirrors the prototype,
-- which has no per-project visibility restriction). Narrow later if needed.
create policy "authenticated read requests" on requests for select using (auth.role() = 'authenticated');
create policy "authenticated read offers" on offers for select using (auth.role() = 'authenticated');
create policy "authenticated read signatures" on signatures for select using (auth.role() = 'authenticated');
create policy "authenticated read docs" on request_documents for select using (auth.role() = 'authenticated');
create policy "authenticated read audit" on audit_log for select using (auth.role() = 'authenticated');
create policy "authenticated read roles" on user_roles for select using (auth.role() = 'authenticated');
create policy "authenticated read assignments" on project_assignments for select using (auth.role() = 'authenticated');

-- Only a Budget Holder can create a request, and only naming themselves as initiator.
create policy "BH creates requests" on requests for insert
  with check (
    initiated_by = auth.uid()
    and exists (select 1 from user_roles where user_id = auth.uid() and role = 'BH')
  );

-- Signing: must currently hold the role being signed for.
-- (The initiator check is enforced separately by the trigger above, so it can't be
-- bypassed even if this policy is ever loosened.)
create policy "role holder signs" on signatures for insert
  with check (
    exists (select 1 from user_roles where user_id = auth.uid() and role = signer_role)
  );

create policy "role holder updates own signature" on signatures for update
  using (
    exists (select 1 from user_roles where user_id = auth.uid() and role = signer_role)
  );

-- CAR/LOG/PM can update documents + folder path (mirrors the prototype's
-- ["PM","LOG","CAR"].includes(role) checks — adjust if you want it tighter).
create policy "PM/LOG/CAR update documents" on request_documents for all
  using (
    exists (select 1 from user_roles where user_id = auth.uid() and role in ('PM','LOG','CAR'))
  );

-- RAC/CAR manage team roles and project assignments (mirrors the prototype's Settings gate).
create policy "RAC/CAR manage roles" on user_roles for all
  using (
    exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role in ('RAC','CAR'))
  );
create policy "RAC/CAR manage assignments" on project_assignments for all
  using (
    exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role in ('RAC','CAR'))
  );
