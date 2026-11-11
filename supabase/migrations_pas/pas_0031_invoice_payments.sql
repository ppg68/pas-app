-- PAS 0031: payments of an invoice, one row each (advance, balance...). An invoice can be paid in parts.
-- Run after pas_0030. Only new objects in schema pas; the invoices table is not changed.
-- invoices.payment_date stays and is kept by the app as "date the invoice was fully paid" (null while unpaid or partial).

create table if not exists pas.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references pas.invoices(id) on delete cascade,
  -- set when the row comes from an approved payment authorization (then the date is filled in by Administration)
  payment_authorization_id uuid unique references pas.payment_authorizations(id) on delete set null,
  payment_date date,
  amount numeric not null default 0 check (amount >= 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_invoice_payments_invoice on pas.invoice_payments(invoice_id);

alter table pas.invoice_payments enable row level security;

-- Administration (Contracts access) manages the payments, like the invoices themselves.
create policy "contracts access manages invoice payments" on pas.invoice_payments for all
  using (pas.has_contracts_access(auth.uid()))
  with check (pas.has_contracts_access(auth.uid()));

-- Whoever approves a payment authorization (CAR / RAC) creates the matching row.
create policy "members add invoice payment from authorization" on pas.invoice_payments for insert
  with check (pas.is_member(auth.uid()) and payment_authorization_id is not null);

grant select, insert, update, delete on pas.invoice_payments to authenticated, service_role;

-- Existing invoices with a payment date: that date and the whole amount become their one payment.
insert into pas.invoice_payments (invoice_id, payment_date, amount, note)
select i.id, i.payment_date, i.amount, i.payment_note
from pas.invoices i
where i.payment_date is not null
  and not exists (select 1 from pas.invoice_payments p where p.invoice_id = i.id);
