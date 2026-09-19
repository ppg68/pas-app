-- PAS — Contracts registry + payment tranches.
-- Independent registry (not linked to `requests`): tracks signed contracts with
-- consultants/suppliers and their payment schedule, replacing the "Elenco contratti"
-- Google Sheet. Apply after 0007_remove_email_domain_restriction.sql.

create type contract_status as enum ('in_corso', 'concluso');
create type contract_kind as enum ('PIVA', 'occasionale');

create table contracts (
  id uuid primary key default gen_random_uuid(),
  legacy_id text, -- original id from the spreadsheet (e.g. "06/24"), kept for traceability during import
  subject text not null, -- Soggetto
  status contract_status not null default 'in_corso',
  typology text, -- Tipologia
  unit text, -- Unità
  role_title text, -- Ruolo
  activity text, -- Attività
  country text,
  project_code text, -- Progetto
  ir_code text, -- IR
  contract_kind contract_kind,
  signed_date date,
  start_date date,
  end_date date,
  project_deadline date,
  currency text not null default 'EUR',
  amount numeric not null default 0, -- importo contratto, IVA compresa
  payment_terms text, -- condizioni di pagamento (free text kept for reference/import)
  signed boolean not null default false,
  privacy boolean not null default false,
  code_of_conduct boolean not null default false,
  psea_policy boolean not null default false,
  criminal_record_check boolean not null default false, -- casellario giudiziale/autocertificazione
  technical_requirements_check boolean not null default false,
  labor_inspectorate_notice boolean not null default false,
  referent text,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contract_tranches (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  seq int not null default 1,
  label text, -- e.g. "1st tranche — upon signature"
  amount numeric not null default 0,
  due_date date,
  due_condition text, -- free text condition when not a fixed date (e.g. "upon delivery of final report")
  paid boolean not null default false,
  paid_date date,
  paid_amount numeric,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_contract_tranches_contract on contract_tranches(contract_id);

-- === Row Level Security ===
alter table contracts enable row level security;
alter table contract_tranches enable row level security;

create policy "authenticated read contracts" on contracts for select using (auth.role() = 'authenticated');
create policy "authenticated read tranches" on contract_tranches for select using (auth.role() = 'authenticated');

-- Same role set as document management on requests (PM/LOG/CAR), plus RAC.
create policy "PM/LOG/CAR/RAC manage contracts" on contracts for all
  using (
    exists (select 1 from user_roles where user_id = auth.uid() and role in ('PM', 'LOG', 'CAR', 'RAC'))
  )
  with check (
    exists (select 1 from user_roles where user_id = auth.uid() and role in ('PM', 'LOG', 'CAR', 'RAC'))
  );

create policy "PM/LOG/CAR/RAC manage tranches" on contract_tranches for all
  using (
    exists (select 1 from user_roles where user_id = auth.uid() and role in ('PM', 'LOG', 'CAR', 'RAC'))
  )
  with check (
    exists (select 1 from user_roles where user_id = auth.uid() and role in ('PM', 'LOG', 'CAR', 'RAC'))
  );
