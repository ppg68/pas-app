-- PAS 0042: "paid" flag on expense reports, separate from the "imported in Callisto" flag.
--
-- Used only by the people carrying the flag "Files expense reports for others" (Settings > Team; Logistics /
-- Contracts) and by an ADMIN. The flag can be set on an approved (or already imported) report and removed again
-- to correct a mistake. Nobody else, including the requester, can change it.
-- Apply with psql / SQL Editor (NOT `supabase db push`). Run after pas_0041.

alter table pas.expense_reports
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by uuid references pas.profiles(id) on delete set null,
  add column if not exists paid_by_name text;

-- the paid fields are written only by set_expense_paid() below
create or replace function pas.expense_paid_guard()
returns trigger
language plpgsql security definer set search_path = pas, pg_temp as $$
begin
  if auth.uid() is null or current_setting('pas.bypass_guard', true) = '1' then
    return new;
  end if;
  if new.paid_at is distinct from old.paid_at
     or new.paid_by is distinct from old.paid_by
     or new.paid_by_name is distinct from old.paid_by_name then
    raise exception 'The paid flag can only be changed with the Paid button.';
  end if;
  return new;
end;
$$;

drop trigger if exists expense_paid_guard_trg on pas.expense_reports;
create trigger expense_paid_guard_trg
  before update on pas.expense_reports
  for each row execute function pas.expense_paid_guard();

create or replace function pas.set_expense_paid(rid uuid, paid boolean)
returns void as $$
declare
  rep pas.expense_reports%rowtype;
  who text;
begin
  if not (pas.can_file_for_others(auth.uid()) or pas.is_admin(auth.uid())) then
    raise exception 'You are not allowed to flag expense reports as paid.';
  end if;
  select * into rep from pas.expense_reports where id = rid for update;
  if not found then
    raise exception 'Expense report not found.';
  end if;
  if rep.status not in ('approved', 'registered') then
    raise exception 'Only an approved report can be flagged as paid.';
  end if;
  select full_name into who from pas.profiles where id = auth.uid();
  perform set_config('pas.bypass_guard', '1', true);
  if paid then
    update pas.expense_reports set paid_at = now(), paid_by = auth.uid(), paid_by_name = who where id = rid;
  else
    update pas.expense_reports set paid_at = null, paid_by = null, paid_by_name = null where id = rid;
  end if;
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

grant execute on function pas.set_expense_paid(uuid, boolean) to authenticated, service_role;
