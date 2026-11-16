-- PAS 0046: trips are approved by one person only, the superior chosen freely by the requester.
--
-- The approval slot 'PM' of pas.trip_approvals now holds the superior: any registered person, no PM / RAC /
-- CAR role is needed to approve. The slot 'RAC' is kept only for the requests already filed with two approvers.
-- Apply with psql / SQL Editor (NOT `supabase db push`). Run after pas_0045.

create or replace function pas.sign_trip_request(rid uuid, as_role pas.app_role)
returns jsonb as $$
declare
  req pas.trip_requests%rowtype;
  ap pas.trip_approvals%rowtype;
  remaining int;
begin
  select * into req from pas.trip_requests where id = rid for update;
  if not found then
    raise exception 'Trip request not found.';
  end if;
  if req.status <> 'pending' then
    raise exception 'This request is not awaiting approval.';
  end if;
  if as_role not in ('PM', 'RAC') then
    raise exception 'Only the superior can approve a trip request.';
  end if;
  select * into ap from pas.trip_approvals where request_id = rid and signer_role = as_role;
  if not found or ap.user_id <> auth.uid() then
    raise exception 'You are not the designated approver for this request.';
  end if;
  if ap.signed_at is not null then
    raise exception 'Already approved.';
  end if;
  if auth.uid() = req.requested_by then
    raise exception 'Segregation of duties: the requester cannot approve their own request.';
  end if;
  -- the superior is a free choice (no role needed); the old second approval still needs RAC / CAR
  if as_role = 'RAC' and not exists (
    select 1 from pas.user_roles where user_id = auth.uid() and role in ('RAC', 'CAR')
  ) then
    raise exception 'You do not hold the role needed to approve (RAC or CAR).';
  end if;

  update pas.trip_approvals set signed_at = now() where request_id = rid and signer_role = as_role;

  select count(*) into remaining from pas.trip_approvals where request_id = rid and signed_at is null;
  if remaining = 0 then
    perform set_config('pas.bypass_guard', '1', true);
    update pas.trip_requests set status = 'closed', closed_at = now() where id = rid;
  end if;

  return jsonb_build_object('all_signed', remaining = 0, 'needs_logistics', req.needs_logistics);
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

grant execute on function pas.sign_trip_request(uuid, pas.app_role) to authenticated, service_role;
