-- The person who compiled the request (Budget Holder) can collect the offers, choose the winner and
-- complete the documents of their own request, even without the PM / LOG / CAR role. They can only move
-- the request through its stages: a trigger refuses any change to the request's own data (amount,
-- procedure, project...) unless the user holds PM / LOG / CAR / RAC / ADMIN, as before.
-- Run after pas_0013. Nothing outside schema pas is touched.

-- stage changes made by the requester: offers -> winner -> documents -> payment
create policy "requester advances own request" on pas.requests for update
  using (initiated_by = auth.uid() and stage in ('offers', 'winner', 'documents'))
  with check (initiated_by = auth.uid());

-- offers, only while offers are being collected
create policy "requester manages offers of own request" on pas.offers for all
  using (exists (
    select 1 from pas.requests r
    where r.id = request_id and r.initiated_by = auth.uid() and r.stage = 'offers'))
  with check (exists (
    select 1 from pas.requests r
    where r.id = request_id and r.initiated_by = auth.uid() and r.stage = 'offers'));

-- documents checklist, only in the documents stage
create policy "requester updates documents of own request" on pas.request_documents for all
  using (exists (
    select 1 from pas.requests r
    where r.id = request_id and r.initiated_by = auth.uid() and r.stage = 'documents'))
  with check (exists (
    select 1 from pas.requests r
    where r.id = request_id and r.initiated_by = auth.uid() and r.stage = 'documents'));

-- the requester may only change the workflow columns of the request
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
      new.initiated_by, new.is_legacy)
     is distinct from
     (old.code, old.ir_number, old.country, old.project_code, old.budget_line, old.description,
      old.estimated_price, old.currency, old.proc_code, old.derogation, old.derogation_reason,
      old.coordination_cost, old.cup_code, old.institutional_activity, old.occasional_collaborator,
      old.initiated_by, old.is_legacy) then
    raise exception 'The requester can only move the request through its stages, not change its data.';
  end if;
  return new;
end;
$$ language plpgsql set search_path = pas, pg_temp;

drop trigger if exists trg_guard_requester_update on pas.requests;
create trigger trg_guard_requester_update
  before update on pas.requests
  for each row execute function pas.guard_requester_update();
