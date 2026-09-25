-- PAS — Invoices section ("Fatture" tab of the IR Purchase list, kept by Elisa).
-- One row per supplier invoice, linked to the IR request (by legacy IR number) and,
-- when present, to a contract (by "N. contratto"). Separate from contract_invoices
-- (older "Elenco Fatture" sheet, keyed only by contract). Access: CONTRACTS role,
-- same as the Contracts module. Apply after 0017/0018 (request link) and 0010 (contract link).

create table invoices (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references requests(id) on delete set null,
  contract_id uuid references contracts(id) on delete set null,
  ir_number text,
  protocol text,
  contract_number text,
  supplier text,
  due_date date,
  payment_date date,
  payment_note text, -- raw cell when "data pagamento" isn't a clean date (e.g. "fattura stornata")
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

create index idx_invoices_request on invoices(request_id);
create index idx_invoices_contract on invoices(contract_id);

alter table invoices enable row level security;

create policy "CONTRACTS role reads invoices (IR)" on invoices for select
  using (exists (select 1 from user_roles where user_id = auth.uid() and role = 'CONTRACTS'));

create policy "CONTRACTS role manages invoices (IR)" on invoices for all
  using (exists (select 1 from user_roles where user_id = auth.uid() and role = 'CONTRACTS'))
  with check (exists (select 1 from user_roles where user_id = auth.uid() and role = 'CONTRACTS'));

grant select, insert, update, delete on invoices to authenticated;
