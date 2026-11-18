-- PAS 0052: the CAP (or an ADMIN) prepares and edits the mission letter text, as Contracts do for contracts.
--   trip_requests.letter       data for the letter (birth, residence, tax code, profile, fees)
--   trip_requests.letter_text  the editable text: [{"key","title","body"}, ...]
-- Only CAP / ADMIN can write them (function below); the requester's form no longer carries these fields.
-- Apply with psql / SQL Editor (NOT `supabase db push`). Run after pas_0051.

alter table pas.trip_requests add column if not exists letter_text jsonb;

create or replace function pas.save_trip_letter(rid uuid, p_letter jsonb, p_text jsonb, p_set_text boolean)
returns void as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;
  if not exists (select 1 from pas.user_roles where user_id = auth.uid() and role in ('CAP', 'ADMIN')) then
    raise exception 'Only the CAP or an administrator can prepare the letter.';
  end if;
  update pas.trip_requests
     set letter = coalesce(p_letter, letter),
         letter_text = case when p_set_text then p_text else letter_text end
   where id = rid;
end;
$$ language plpgsql security definer set search_path = pas, pg_temp;

grant execute on function pas.save_trip_letter(uuid, jsonb, jsonb, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
