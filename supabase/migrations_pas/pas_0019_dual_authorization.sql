-- Dual authorization (Oikos purchase procedures revised, 01/11/2026):
--   1. EVERY expense, direct purchases (up to 200 EUR) included, is approved by the administration
--      (CAR or RAC, one of the two) both at the IR and for each payment authorization (PA).
--   2. Above a direct purchase the PM signs as well (PM + administration, two different people).
--      requests.pm_required says whether the PM signature is requested: false when the person who compiled
--      the request is the PM (nobody signs their own request), for coordination costs (no project) and for
--      requests created before this migration.
-- Which roles fill which slot is decided by lib/domain/procedures.ts (irSlots / paymentSlots); the
-- payment side is mirrored here in pas.payment_slots() because the database closes the request.
-- Run after pas_0018. Nothing outside schema pas is touched.

alter table pas.requests add column if not exists pm_required boolean not null default false;

-- The requester may not change pm_required (guard from pas_0014, with the new column added).
create or replace function pas.guard_requester_update()
returns trigger as $$
begin
  -- no signed-in user (service role, register sync): not restricted here
  if auth.uid() is null then
    return new;
  end if;
  if exists (
    select 1 from pas.user_roles
    where user_id = auth.uid() and role in ('PM', 'LOG', 'CAR', 'RAC', 'ADMIN')
  ) then
    return new;
  end if;

  if (new.code, new.ir_number, new.country, new.project_code, new.budget_line, new.description,
      new.estimated_price, new.currency, new.proc_code, new.derogation, new.derogation_reason,
      new.coordination_cost, new.cup_code, new.institutional_activity, new.occasional_collaborator,
      new.initiated_by, new.is_legacy, new.pm_required)
     is distinct from
     (old.code, old.ir_number, old.country, old.project_code, old.budget_line, old.description,
      old.estimated_price, old.currency, old.proc_code, old.derogation, old.derogation_reason,
      old.coordination_cost, old.cup_code, old.institutional_activity, old.occasional_collaborator,
      old.initiated_by, old.is_legacy, old.pm_required) then
    raise exception 'The requester can only move the request through its stages, not change its data.';
  end if;
  return new;
end;
$$ language plpgsql set search_path = pas, pg_temp;

-- IR signatures: besides "not the creator", the same person cannot give two signatures of the same phase.
create or replace function pas.enforce_segregation_of_duties()
returns trigger as $$
declare
  req pas.requests%rowtype;
begin
  select * into req from pas.requests where id = new.request_id;
  if new.signed_by is not null and new.signed_by = req.initiated_by then
    raise exception 'Segregation of duties: whoever created the request cannot sign it (PR04)';
  end if;
  if new.signed_by is not null and exists (
    select 1 from pas.signatures s
     where s.request_id = new.request_id
       and s.phase = new.phase
       and s.signed_by = new.signed_by
       and s.id is distinct from new.id) then
    raise exception 'Dual authorization: the same person cannot give two of the signatures.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

-- Signatures of each payment authorization (one per slot).
create table if not exists pas.payment_authorization_signatures (
  payment_authorization_id uuid not null references pas.payment_authorizations(id) on delete cascade,
  signer_role pas.app_role not null,
  signed_by uuid not null references pas.profiles(id),
  signed_at timestamptz not null default now(),
  primary key (payment_authorization_id, signer_role),
  unique (payment_authorization_id, signed_by)
);

alter table pas.payment_authorization_signatures enable row level security;

-- read-only for members: signatures are written only by authorize_payment (security definer)
create policy "member reads payment authorization signatures" on pas.payment_authorization_signatures
  for select using (pas.is_member(auth.uid()));

-- authorizations already given keep their evidence
insert into pas.payment_authorization_signatures (payment_authorization_id, signer_role, signed_by, signed_at)
select id, authorized_role, authorized_by, coalesce(authorized_at, created_at)
  from pas.payment_authorizations
 where status = 'authorized' and authorized_role is not null and authorized_by is not null
on conflict do nothing;

-- The PM now signs the payment, so only the person who compiled the request prepares the PA.
drop policy if exists "requester or PM prepares payment authorization" on pas.payment_authorizations;
create policy "requester prepares payment authorization" on pas.payment_authorizations for insert
  with check (
    prepared_by = auth.uid()
    and status = 'pending'
    and authorized_by is null
    and exists (select 1 from pas.requests r where r.id = request_id and r.initiated_by = auth.uid())
  );

-- Required signature slots of a payment authorization: array of arrays of roles, ANY ONE role of each
-- array signs. Mirror of paymentSlots() in lib/domain/procedures.ts.
create or replace function pas.payment_slots(r pas.requests)
returns jsonb as $$
declare
  admin_roles text[];
  slots jsonb;
begin
  if r.coordination_cost then
    admin_roles := array['RAC'];
  elsif r.proc_code::text in ('DIR', 'SQ', '3Q') then
    admin_roles := array['CAR', 'RAC'];
  elsif r.proc_code::text = 'SP' then
    admin_roles := array['CAR'];
  else
    admin_roles := array['RAC'];
  end if;
  slots := jsonb_build_array(to_jsonb(admin_roles));
  if r.pm_required then
    slots := jsonb_build_array(to_jsonb(array['PM']::text[])) || slots;
  end if;
  return slots;
end;
$$ language plpgsql stable set search_path = pas, pg_temp;

-- Direct purchases are no longer recorded without approval.
drop function if exists pas.record_direct_payment(uuid);

-- One signature of a payment authorization. SECURITY DEFINER so that the time comes from the database
-- and nothing else can be changed by the signer. The PA is authorized (and the request closed when the
-- winning offer is fully paid) when every slot has a signature.
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
