-- Direct purchases (DIR, up to 200 EUR): no IR approval and no approval of the payment authorization (PA);
-- the Budget Holder only fills in the PA with the payment data, which is recorded and closes the request.
-- Run after pas_0010. Adds the status 'recorded' and the function that records a DIR payment.

alter table pas.payment_authorizations drop constraint if exists payment_authorizations_status_check;
alter table pas.payment_authorizations
  add constraint payment_authorizations_status_check
  check (status in ('pending', 'authorized', 'recorded'));

create or replace function pas.record_direct_payment(pa_id uuid)
returns void as $$
declare
  pa pas.payment_authorizations%rowtype;
  req pas.requests%rowtype;
begin
  select * into pa from pas.payment_authorizations where id = pa_id for update;
  if not found then
    raise exception 'Payment authorization not found.';
  end if;
  if pa.prepared_by is distinct from auth.uid() then
    raise exception 'Only the person who prepared the payment data can record it.';
  end if;
  if pa.status <> 'pending' then
    raise exception 'This payment has already been recorded.';
  end if;

  select * into req from pas.requests where id = pa.request_id;
  if req.proc_code <> 'DIR' then
    raise exception 'Only direct purchases are recorded without approval.';
  end if;
  if req.stage <> 'payment' then
    raise exception 'The request is not in the payment stage.';
  end if;

  update pas.payment_authorizations set status = 'recorded' where id = pa_id;

  if pa.invoice_id is not null then
    update pas.invoices set pa_signed = true where id = pa.invoice_id;
  end if;

  insert into pas.audit_log (request_id, user_id, action)
  values (req.id, auth.uid(), 'direct_payment_recorded');

  -- a direct purchase is a single payment: the request closes once it is recorded
  update pas.requests set stage = 'completed' where id = req.id;
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

revoke execute on function pas.record_direct_payment(uuid) from public, anon;
grant execute on function pas.record_direct_payment(uuid) to authenticated, service_role;
