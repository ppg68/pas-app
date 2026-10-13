-- Payment authorizations (form PR04.AA05): one per payment, several per IR request.
-- Prepared by the Budget Holder (the person who compiled the request) or the PM, then approved by
-- CAR / RAC. Approval is stored on the row itself (not in pas.signatures, which allows one signature
-- per role per request). The request closes when the authorized total reaches the value of the
-- winning offer (NOT the estimated IR amount).
-- Apply with psql / SQL Editor (NOT `supabase db push`). Nothing outside schema pas is touched.

create table if not exists pas.payment_authorizations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references pas.requests(id) on delete cascade,
  invoice_id uuid references pas.invoices(id) on delete set null,
  pa_date date not null default current_date,
  description text not null,
  bank_description text,
  donor_procedure text,
  communication_activity boolean not null default false,
  payment_type text not null default 'bank_transfer'
    check (payment_type in ('bank_transfer', 'cash', 'other')),
  payment_type_other text,
  beneficiary text not null,
  payment_details text,
  amount numeric not null check (amount > 0),
  balance_after numeric,
  currency text not null default 'EUR',
  euro_equivalent numeric,
  prepared_by uuid references pas.profiles(id),
  status text not null default 'pending' check (status in ('pending', 'authorized')),
  authorized_by uuid references pas.profiles(id),
  authorized_role pas.app_role,
  authorized_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_auth_request on pas.payment_authorizations(request_id);
create index if not exists idx_payment_auth_invoice on pas.payment_authorizations(invoice_id);

alter table pas.payment_authorizations enable row level security;

create policy "member reads payment authorizations" on pas.payment_authorizations for select
  using (pas.is_member(auth.uid()));

-- The person who compiled the request, or a PM, prepares the form (always as themselves, always pending).
create policy "requester or PM prepares payment authorization" on pas.payment_authorizations for insert
  with check (
    prepared_by = auth.uid()
    and status = 'pending'
    and authorized_by is null
    and (
      exists (select 1 from pas.requests r where r.id = request_id and r.initiated_by = auth.uid())
      or exists (select 1 from pas.user_roles where user_id = auth.uid() and role = 'PM')
    )
  );

-- The preparer can correct or withdraw their own form until it is authorized.
create policy "preparer edits own pending payment authorization" on pas.payment_authorizations for update
  using (prepared_by = auth.uid() and status = 'pending')
  with check (prepared_by = auth.uid() and status = 'pending' and authorized_by is null);
create policy "preparer withdraws own pending payment authorization" on pas.payment_authorizations for delete
  using (prepared_by = auth.uid() and status = 'pending');

-- Approval. SECURITY DEFINER so that the approval time comes from the database and the other
-- columns cannot be changed by the approver. Which of CAR / RAC is required for a given procedure
-- is decided by the app (lib/domain/procedures.ts paymentSigners); here the caller must hold the role
-- they sign as (CAR or RAC), must not be the preparer or the requester (segregation of duties).
create or replace function pas.authorize_payment(pa_id uuid, as_role pas.app_role)
returns jsonb as $$
declare
  pa pas.payment_authorizations%rowtype;
  req pas.requests%rowtype;
  target numeric;
  total numeric;
  done boolean := false;
begin
  select * into pa from pas.payment_authorizations where id = pa_id for update;
  if not found then
    raise exception 'Payment authorization not found.';
  end if;
  if pa.status <> 'pending' then
    raise exception 'This payment authorization has already been authorized.';
  end if;
  if as_role not in ('CAR', 'RAC') then
    raise exception 'Only CAR or RAC can authorize a payment.';
  end if;
  if not exists (select 1 from pas.user_roles where user_id = auth.uid() and role = as_role) then
    raise exception 'You do not hold the role %.', as_role;
  end if;

  select * into req from pas.requests where id = pa.request_id;
  if req.stage <> 'payment' then
    raise exception 'The request is not in the payment stage.';
  end if;
  if auth.uid() = pa.prepared_by or auth.uid() = req.initiated_by then
    raise exception 'Segregation of duties: whoever prepared the request or the payment cannot authorize it.';
  end if;

  update pas.payment_authorizations
     set status = 'authorized', authorized_by = auth.uid(), authorized_role = as_role, authorized_at = now()
   where id = pa_id;

  if pa.invoice_id is not null then
    update pas.invoices set pa_signed = true where id = pa.invoice_id;
  end if;

  insert into pas.audit_log (request_id, user_id, role, action)
  values (req.id, auth.uid(), as_role, 'payment_authorized');

  -- close the request when the authorized total reaches the value of the winning offer
  select price into target from pas.offers where id = req.winner_offer_id;
  select coalesce(sum(
           case
             when currency = req.currency then amount
             when req.currency = 'EUR' then coalesce(euro_equivalent, 0)
             else 0
           end), 0)
    into total
    from pas.payment_authorizations
   where request_id = req.id and status = 'authorized';

  if target is not null and total >= target - 0.005 then
    update pas.requests set stage = 'completed' where id = req.id;
    done := true;
  end if;

  return jsonb_build_object('completed', done, 'total', total, 'target', target);
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

revoke execute on function pas.authorize_payment(uuid, pas.app_role) from public, anon;
grant execute on function pas.authorize_payment(uuid, pas.app_role) to authenticated, service_role;
