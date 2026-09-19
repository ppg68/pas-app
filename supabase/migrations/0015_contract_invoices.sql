-- PAS — Contracts: invoices ("Elenco Fatture" sheet).
-- Elisa records actual invoices against a contract (by the same legacy
-- "id contratto" code as the Contracts sheet); their totals are what
-- "importo pagato" on a contract really is. Separate from contract_tranches
-- (a planned/schedule concept introduced by this app) — invoices are the
-- real, dated financial record. Apply after 0014_fix_contracts_role_recursion.sql.

create table contract_invoices (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references contracts(id) on delete set null,
  legacy_contract_id text not null, -- the sheet's "id contratto" — kept even if contract_id link is missing/broken
  subject text, -- Soggetto, kept for rows that don't resolve to a contract
  invoice_number text,
  invoice_date date,
  amount numeric not null default 0,
  protocol text, -- protocollo f.tt.
  description text,
  paid_amount numeric,
  payment_date date,
  payment_note text, -- raw "data pagamento" cell when it isn't a clean date (e.g. "30/06 FIDEURAM")
  notes text,
  created_at timestamptz not null default now()
);

create index idx_contract_invoices_contract on contract_invoices(contract_id);
create index idx_contract_invoices_legacy on contract_invoices(legacy_contract_id);

alter table contract_invoices enable row level security;

create policy "CONTRACTS role reads invoices" on contract_invoices for select
  using (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'CONTRACTS')
  );

create policy "CONTRACTS role manages invoices" on contract_invoices for all
  using (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'CONTRACTS')
  )
  with check (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'CONTRACTS')
  );
