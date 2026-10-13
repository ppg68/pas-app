-- At approval time, a payment authorization that is not yet linked to an invoice is linked to the
-- request's only invoice that no other payment authorization covers, so "PA signed" gets ticked.
-- (The PA may have been prepared before the invoice was entered.) Same signature as in pas_0010.

create or replace function pas.authorize_payment(pa_id uuid, as_role pas.app_role)
returns jsonb as $$
declare
  pa pas.payment_authorizations%rowtype;
  req pas.requests%rowtype;
  target numeric;
  total numeric;
  free_count int;
  free_invoice uuid;
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

  -- no invoice chosen on the form: the request's only uncovered invoice is the one
  if pa.invoice_id is null then
    select count(*), min(i.id::text)::uuid into free_count, free_invoice
      from pas.invoices i
     where i.request_id = req.id
       and not exists (
         select 1 from pas.payment_authorizations o
          where o.invoice_id = i.id and o.id <> pa_id);
    if free_count = 1 then
      pa.invoice_id := free_invoice;
    end if;
  end if;

  update pas.payment_authorizations
     set status = 'authorized', authorized_by = auth.uid(), authorized_role = as_role,
         authorized_at = now(), invoice_id = pa.invoice_id
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
