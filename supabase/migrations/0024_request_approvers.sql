-- PAS — optional designated approvers per request (who gets the "ready for approval" email).
-- Informational only: signing rights are still decided by role (user_roles) and the
-- segregation-of-duties trigger. Set by the request creator at creation time.

create table request_approvers (
  request_id uuid not null references requests(id) on delete cascade,
  signer_role app_role not null,
  user_id uuid not null references profiles(id) on delete cascade,
  notified_at timestamptz,
  primary key (request_id, signer_role)
);

alter table request_approvers enable row level security;

create policy "authenticated read approvers" on request_approvers for select
  using (auth.role() = 'authenticated');

create policy "creator sets approvers" on request_approvers for insert
  with check (exists (select 1 from requests r where r.id = request_id and r.initiated_by = auth.uid()));

create policy "creator updates approvers" on request_approvers for update
  using (exists (select 1 from requests r where r.id = request_id and r.initiated_by = auth.uid()));

grant select, insert, update on request_approvers to authenticated;
