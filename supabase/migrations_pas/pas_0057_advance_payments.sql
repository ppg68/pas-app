-- PAS 0057: advance payments (payment authorized BEFORE the invoice exists).
--   payment_authorizations.is_advance                  the payment is an advance: the invoice is still to come
--   payment_authorizations.advance_reason              why (proforma, online/card purchase, ticket/booking, deposit, foreign supplier, other)
--   payment_authorizations.advance_reason_other        free text when the reason is "other"
--   payment_authorizations.advance_reminder_sent_at    last reminder e-mail about the missing invoice
--   payment_authorizations.advance_invoice_linked_at   when the invoice was linked (the advance is then closed)
-- An advance is "open" while invoice_id is null. The invoice is expected 30 days after the authorization
-- (30 days after the preparation while it is not yet authorized); the 30 days are in lib/domain/advances.ts.
-- pas.link_advance_invoice(): links the invoice that arrived to an advance (the payment rows are written by the app).
-- Apply with psql / SQL Editor (NOT `supabase db push`). Run after pas_0056. Only new columns / function.

alter table pas.payment_authorizations
  add column if not exists is_advance boolean not null default false,
  add column if not exists advance_reason text,
  add column if not exists advance_reason_other text,
  add column if not exists advance_reminder_sent_at timestamptz,
  add column if not exists advance_invoice_linked_at timestamptz;

alter table pas.payment_authorizations drop constraint if exists payment_authorizations_advance_check;
alter table pas.payment_authorizations
  add constraint payment_authorizations_advance_check
  check (
    not is_advance
    or advance_reason in ('proforma', 'online_card', 'ticket_booking', 'deposit', 'foreign_supplier', 'other')
  );

create index if not exists idx_payment_auth_open_advance
  on pas.payment_authorizations (created_at)
  where is_advance and invoice_id is null;

-- Links the invoice to an open advance. SECURITY DEFINER because the preparer can no longer edit a PA once it is authorized.
create or replace function pas.link_advance_invoice(pa_id uuid, inv_id uuid)
returns void as $$
declare
  pa pas.payment_authorizations%rowtype;
  req pas.requests%rowtype;
  inv pas.invoices%rowtype;
begin
  select * into pa from pas.payment_authorizations where id = pa_id for update;
  if not found then
    raise exception 'Payment authorization not found.';
  end if;
  if not pa.is_advance then
    raise exception 'This payment authorization is not an advance payment.';
  end if;
  if pa.invoice_id is not null then
    raise exception 'The invoice of this advance has already been linked.';
  end if;

  select * into req from pas.requests where id = pa.request_id;
  if not (
    auth.uid() = pa.prepared_by
    or auth.uid() = req.initiated_by
    or exists (select 1 from pas.user_roles where user_id = auth.uid() and role in ('CONTRACTS', 'ADMIN'))
  ) then
    raise exception 'Only the Budget Holder who prepared the payment, Contracts or the administration can link the invoice.';
  end if;

  select * into inv from pas.invoices where id = inv_id;
  if not found or inv.request_id is distinct from pa.request_id then
    raise exception 'The invoice does not belong to this request.';
  end if;
  if exists (select 1 from pas.payment_authorizations o where o.invoice_id = inv_id and o.id <> pa_id) then
    raise exception 'This invoice is already linked to another payment authorization.';
  end if;

  update pas.payment_authorizations
     set invoice_id = inv_id, advance_invoice_linked_at = now()
   where id = pa_id;

  if pa.status in ('authorized', 'recorded') then
    update pas.invoices set pa_signed = true where id = inv_id;
  end if;

  insert into pas.audit_log (request_id, user_id, action)
  values (pa.request_id, auth.uid(), 'advance_invoice_linked');
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

revoke execute on function pas.link_advance_invoice(uuid, uuid) from public, anon;
grant execute on function pas.link_advance_invoice(uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
