-- Contract requests: the second approval (slot 'RAC') can be given by a RAC or by a CAR.
-- The approval slot keeps the name 'RAC'; the person chosen may hold either role.

create or replace function pas.contract_role_holders(r pas.app_role)
returns table (id uuid, full_name text, email text) as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;
  if r not in ('PM', 'RAC', 'CAR', 'CONTRACTS', 'DG') then
    raise exception 'Role not available.';
  end if;
  return query
    select p.id, p.full_name, p.email
      from pas.user_roles ur
      join pas.profiles p on p.id = ur.user_id
     where ur.role = r
     order by p.full_name;
end;
$$ language plpgsql security definer set search_path = pas, pg_temp stable;

create or replace function pas.sign_contract_request(rid uuid, as_role pas.app_role)
returns jsonb as $$
declare
  req pas.contract_requests%rowtype;
  ap pas.contract_approvals%rowtype;
  remaining int;
begin
  select * into req from pas.contract_requests where id = rid for update;
  if not found then
    raise exception 'Contract request not found.';
  end if;
  if req.status <> 'pending' then
    raise exception 'This request is not awaiting approval.';
  end if;
  if as_role not in ('PM', 'RAC') then
    raise exception 'Only PM or RAC / CAR can approve a contract request.';
  end if;
  select * into ap from pas.contract_approvals where request_id = rid and signer_role = as_role;
  if not found or ap.user_id <> auth.uid() then
    raise exception 'You are not the designated approver for this role.';
  end if;
  if ap.signed_at is not null then
    raise exception 'Already approved.';
  end if;
  if auth.uid() = req.requested_by then
    raise exception 'Segregation of duties: the requester cannot approve their own request.';
  end if;
  if not exists (
    select 1 from pas.user_roles
     where user_id = auth.uid()
       and (role = as_role or (as_role = 'RAC' and role = 'CAR'))
  ) then
    raise exception 'You do not hold the role needed to approve (%).', case when as_role = 'RAC' then 'RAC or CAR' else as_role::text end;
  end if;

  update pas.contract_approvals set signed_at = now() where request_id = rid and signer_role = as_role;

  select count(*) into remaining from pas.contract_approvals where request_id = rid and signed_at is null;
  if remaining = 0 then
    perform set_config('pas.bypass_guard', '1', true);
    update pas.contract_requests set status = 'approved' where id = rid;
  end if;

  return jsonb_build_object('all_signed', remaining = 0);
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

grant execute on function pas.contract_role_holders(pas.app_role), pas.sign_contract_request(uuid, pas.app_role)
  to authenticated, service_role;
