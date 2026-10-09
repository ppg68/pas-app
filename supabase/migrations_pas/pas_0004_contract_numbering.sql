-- PAS 0004: automatic progressive contract number (legacy_id, shown as "ID").
--
-- Same convention as the historical register:
--   ordinary contracts      N/YY      progressive, restarts every year      e.g. 43/26
--   occasional services     NN_YYO    own progressive per year, 2 digits    e.g. 09_26O
-- YY = year of the signed date (current year when there is no signed date).
-- Only fills legacy_id when it is empty, so imports and manual IDs are left untouched.
-- A transaction-level advisory lock serialises concurrent inserts (no duplicate numbers).

create or replace function pas.assign_contract_number()
returns trigger
language plpgsql security definer set search_path = pas, pg_temp as $$
declare
  yy  text;
  occ boolean;
  n   int;
begin
  if new.legacy_id is not null and btrim(new.legacy_id) <> '' then
    return new;
  end if;

  yy  := lpad((extract(year from coalesce(new.signed_date, current_date))::int % 100)::text, 2, '0');
  occ := coalesce(new.contract_kind, '') ilike 'occasional%';

  perform pg_advisory_xact_lock(hashtext('pas.contract_number'));

  if occ then
    select coalesce(max((regexp_match(c.legacy_id, '^(\d+)_' || yy || 'O$'))[1]::int), 0) + 1
      into n from pas.contracts c;
    new.legacy_id := lpad(n::text, 2, '0') || '_' || yy || 'O';
  else
    select coalesce(max((regexp_match(c.legacy_id, '^(\d+)/' || yy || '$'))[1]::int), 0) + 1
      into n from pas.contracts c;
    new.legacy_id := n::text || '/' || yy;
  end if;

  return new;
end;
$$;

drop trigger if exists contracts_assign_number on pas.contracts;
create trigger contracts_assign_number
  before insert on pas.contracts
  for each row execute function pas.assign_contract_number();
