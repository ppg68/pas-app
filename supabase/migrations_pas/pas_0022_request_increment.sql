-- Additional service ("increment"): after the request is paid in full (closed) the supplier can be asked for
-- more service, paid for up to 50% of the initial value of the supply (winning offer; for a direct purchase
-- the estimated amount). The Budget Holder records the increment with a reason; the request goes back to the
-- payment stage and the new payment authorizations are approved as usual. The request closes again when
-- the authorized total reaches offer + increment.
-- Run after pas_0021. Nothing outside schema pas is touched.

alter table pas.requests
  add column if not exists increment_amount numeric not null default 0,
  add column if not exists increment_reason text;

create or replace function pas.add_increment(req_id uuid, amount numeric, reason text)
returns jsonb as $$
declare
  req pas.requests%rowtype;
  base numeric;
  cap numeric;
begin
  select * into req from pas.requests where id = req_id for update;
  if not found then
    raise exception 'Request not found.';
  end if;
  if req.initiated_by is distinct from auth.uid() then
    raise exception 'Only the person who compiled the request (Budget Holder) can add an increment.';
  end if;
  if req.stage not in ('payment', 'completed') then
    raise exception 'An increment can be added once the request is in the payment stage.';
  end if;
  if amount is null or amount <= 0 then
    raise exception 'Enter a valid additional amount.';
  end if;
  if reason is null or btrim(reason) = '' then
    raise exception 'The reason for the additional service is required.';
  end if;

  select price into base from pas.offers where id = req.winner_offer_id;
  base := coalesce(base, req.estimated_price);
  cap := round(base * 0.5, 2);
  if coalesce(req.increment_amount, 0) + amount > cap + 0.005 then
    raise exception 'The increments cannot exceed 50%% of the initial value (maximum %, already %).',
      cap, coalesce(req.increment_amount, 0);
  end if;

  update pas.requests
     set increment_amount = coalesce(increment_amount, 0) + amount,
         increment_reason = case when increment_reason is null then reason
                                 else increment_reason || E'\n' || reason end,
         stage = 'payment'
   where id = req.id;

  insert into pas.audit_log (request_id, user_id, action)
  values (req.id, auth.uid(), 'increment_added');

  return jsonb_build_object('increment', coalesce(req.increment_amount, 0) + amount, 'cap', cap);
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

revoke execute on function pas.add_increment(uuid, numeric, text) from public, anon;
grant execute on function pas.add_increment(uuid, numeric, text) to authenticated, service_role;

-- authorize_payment: the target now includes the increment
create or replace function pas.authorize_payment(pa_id uuid, as_role pas.app_role)
returns jsonb as $$
declare
  pa pas.payment_authorizations%rowtype;
  req pas.requests%rowtype;
  v_slots jsonb;
  slot_roles text[];
  n int;
  in_slot boolean := false;
  all_ok boolean := true;
  v_pending jsonb := '[]'::jsonb;
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
  if as_role not in ('CAR', 'RAC', 'PM') then
    raise exception 'Only the PM, CAR or RAC can authorize a payment.';
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
  if exists (
    select 1 from pas.payment_authorization_signatures s
     where s.payment_authorization_id = pa_id and s.signed_by = auth.uid()) then
    raise exception 'Dual authorization: you have already signed; the other signature must come from a different person.';
  end if;

  v_slots := pas.payment_slots(req);

  -- the role must fill a slot that is still open
  for n in 0 .. jsonb_array_length(v_slots) - 1 loop
    slot_roles := array(select jsonb_array_elements_text(v_slots -> n));
    if as_role::text = any(slot_roles) then
      in_slot := true;
      if exists (
        select 1 from pas.payment_authorization_signatures s
         where s.payment_authorization_id = pa_id and s.signer_role::text = any(slot_roles)) then
        raise exception 'This approval has already been given.';
      end if;
    end if;
  end loop;
  if not in_slot then
    raise exception 'The role % is not required to authorize this payment.', as_role;
  end if;

  insert into pas.payment_authorization_signatures (payment_authorization_id, signer_role, signed_by)
  values (pa_id, as_role, auth.uid());

  insert into pas.audit_log (request_id, user_id, role, action)
  values (req.id, auth.uid(), as_role, 'payment_signed');

  -- which slots are still open?
  for n in 0 .. jsonb_array_length(v_slots) - 1 loop
    slot_roles := array(select jsonb_array_elements_text(v_slots -> n));
    if not exists (
      select 1 from pas.payment_authorization_signatures s
       where s.payment_authorization_id = pa_id and s.signer_role::text = any(slot_roles)) then
      all_ok := false;
      v_pending := v_pending || jsonb_build_array(to_jsonb(slot_roles));
    end if;
  end loop;

  if not all_ok then
    return jsonb_build_object('authorized', false, 'completed', false, 'pending', v_pending);
  end if;

  -- no invoice chosen on the form: the request's only uncovered invoice is the one
  if pa.invoice_id is null then
    select count(*), min(inv.id::text)::uuid into free_count, free_invoice
      from pas.invoices inv
     where inv.request_id = req.id
       and not exists (
         select 1 from pas.payment_authorizations o
          where o.invoice_id = inv.id and o.id <> pa_id);
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
  select price + coalesce(req.increment_amount, 0) into target from pas.offers where id = req.winner_offer_id;
  select coalesce(sum(
           case
             when currency = req.currency then amount
             when req.currency = 'EUR' then coalesce(euro_equivalent, 0)
             else 0
           end), 0)
    into total
    from pas.payment_authorizations
   where request_id = req.id and status = 'authorized';

  -- a direct purchase has no offers: it is a single payment, the request closes with it
  if req.proc_code::text = 'DIR' and req.winner_offer_id is null then
    update pas.requests set stage = 'completed' where id = req.id;
    done := true;
  elsif target is not null and total >= target - 0.005 then
    update pas.requests set stage = 'completed' where id = req.id;
    done := true;
  end if;

  return jsonb_build_object('authorized', true, 'completed', done, 'total', total, 'target', target);
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

revoke execute on function pas.authorize_payment(uuid, pas.app_role) from public, anon;
grant execute on function pas.authorize_payment(uuid, pas.app_role) to authenticated, service_role;
