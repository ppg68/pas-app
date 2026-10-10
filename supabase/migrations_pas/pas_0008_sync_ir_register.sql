-- PAS 0008: one-way synchronisation of the IR register (Google Sheet "IR Purchase list", tab IR)
-- into pas.requests, until the sheet is dismissed.
--
--  * The sheet stays the source of truth; an Apps Script in the sheet sends the rows every hour
--    to pas.sync_ir_register(), which creates / updates LEGACY requests (is_legacy = true) only.
--    Requests created in the app are never touched.
--  * The call is protected by a secret token. Only its SHA-256 hash is stored (pas.settings);
--    the token itself is shown once by pas.create_ir_sync_token() and lives in the Apps Script.

-- one legacy request per IR number
create unique index if not exists requests_legacy_ir_number_key
  on pas.requests (legacy_ir_number) where is_legacy and legacy_ir_number is not null;

-- ---------------------------------------------------------------------------------------------
-- Creates (or rotates) the sync token. Callable from the SQL Editor or by an ADMIN. Returns the
-- token in clear ONCE: copy it into the Apps Script properties.
create or replace function pas.create_ir_sync_token()
returns text
language plpgsql security definer set search_path = pas, public, pg_temp as $$
declare
  tok text;
begin
  if not (session_user in ('postgres', 'supabase_admin') or pas.is_admin(auth.uid())) then
    raise exception 'not allowed';
  end if;
  tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into pas.settings (key, value)
  values ('ir_sync_token_hash', encode(sha256(convert_to(tok, 'UTF8')), 'hex'))
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return tok;
end;
$$;

revoke all on function pas.create_ir_sync_token() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Receives the transformed rows of the IR register. p_rows is a JSON array of objects:
--   ir, project, budget, description, price, proc (DIR|SQ|3Q|SP|TEN), cup, supplier,
--   coordination, institutional, occasional, created (YYYY-MM-DD), initiator, protocol, note
create or replace function pas.sync_ir_register(p_token text, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = pas, public, pg_temp as $$
declare
  want text;
  r jsonb;
  rid uuid;
  oid uuid;
  v_ir text;
  v_proc text;
  v_letter text;
  v_code text;
  v_created timestamptz;
  v_initiator uuid;
  v_price numeric;
  n_ins int := 0;
  n_upd int := 0;
  n_skip int := 0;
begin
  select value into want from pas.settings where key = 'ir_sync_token_hash';
  if want is null or p_token is null
     or want <> encode(sha256(convert_to(p_token, 'UTF8')), 'hex') then
    raise exception 'invalid token';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_ir := nullif(btrim(r->>'ir'), '');
    v_proc := upper(coalesce(r->>'proc', ''));
    if v_ir is null or nullif(btrim(r->>'description'), '') is null
       or v_proc not in ('DIR', 'SQ', '3Q', 'SP', 'TEN') then
      n_skip := n_skip + 1;
      continue;
    end if;

    v_price := coalesce(nullif(r->>'price', '')::numeric, 0);
    v_created := case when nullif(r->>'created', '') is not null
                      then ((r->>'created') || ' 12:00:00+00')::timestamptz else null end;
    select p.id into v_initiator from pas.profiles p
      where nullif(btrim(r->>'initiator'), '') is not null
        and lower(p.full_name) = lower(btrim(r->>'initiator')) limit 1;

    select id into rid from pas.requests where is_legacy and legacy_ir_number = v_ir limit 1;

    if rid is null then
      v_letter := case v_proc when 'DIR' then 'A' when 'SQ' then 'B' when '3Q' then 'C'
                              when 'SP' then 'D' else 'E' end;
      v_code := v_ir || '_' || v_letter || '_' || v_proc || '_' || btrim(r->>'description')
                || '_' || coalesce(nullif(btrim(r->>'project'), ''), 'NA');
      if exists (select 1 from pas.requests where code = v_code) then
        v_code := v_code || '_' || left(replace(gen_random_uuid()::text, '-', ''), 6);
      end if;

      insert into pas.requests (
        code, country, project_code, budget_line, description, estimated_price, currency, proc_code,
        derogation, coordination_cost, cup_code, institutional_activity, occasional_collaborator,
        initiated_by, stage, created_at, is_legacy, legacy_ir_number, legacy_initiator_name,
        legacy_protocol, legacy_note
      ) values (
        v_code, 'IT', coalesce(nullif(btrim(r->>'project'), ''), 'NA'),
        coalesce(nullif(btrim(r->>'budget'), ''), 'NA'), btrim(r->>'description'), v_price, 'EUR',
        v_proc::pas.proc_code, false, coalesce((r->>'coordination')::boolean, false),
        nullif(btrim(r->>'cup'), ''), coalesce((r->>'institutional')::boolean, false),
        coalesce((r->>'occasional')::boolean, false), v_initiator, 'completed',
        coalesce(v_created, now()), true, v_ir, nullif(btrim(r->>'initiator'), ''),
        nullif(btrim(r->>'protocol'), ''), nullif(btrim(r->>'note'), '')
      ) returning id into rid;

      insert into pas.audit_log (request_id, action) values (rid, 'imported_from_sheet');

      if nullif(btrim(r->>'supplier'), '') is not null then
        insert into pas.offers (request_id, supplier, price)
        values (rid, btrim(r->>'supplier'), v_price) returning id into oid;
        update pas.requests set winner_offer_id = oid where id = rid;
      end if;
      n_ins := n_ins + 1;
    else
      update pas.requests set
        project_code = coalesce(nullif(btrim(r->>'project'), ''), 'NA'),
        budget_line = coalesce(nullif(btrim(r->>'budget'), ''), 'NA'),
        description = btrim(r->>'description'),
        estimated_price = v_price,
        proc_code = v_proc::pas.proc_code,
        coordination_cost = coalesce((r->>'coordination')::boolean, false),
        cup_code = nullif(btrim(r->>'cup'), ''),
        institutional_activity = coalesce((r->>'institutional')::boolean, false),
        occasional_collaborator = coalesce((r->>'occasional')::boolean, false),
        legacy_initiator_name = nullif(btrim(r->>'initiator'), ''),
        legacy_protocol = nullif(btrim(r->>'protocol'), ''),
        legacy_note = nullif(btrim(r->>'note'), ''),
        created_at = coalesce(v_created, created_at),
        initiated_by = coalesce(v_initiator, initiated_by),
        updated_at = now()
      where id = rid
        and (project_code, budget_line, description, estimated_price, proc_code::text,
             coordination_cost, cup_code, institutional_activity, occasional_collaborator,
             legacy_initiator_name, legacy_protocol, legacy_note)
            is distinct from
            (coalesce(nullif(btrim(r->>'project'), ''), 'NA'),
             coalesce(nullif(btrim(r->>'budget'), ''), 'NA'), btrim(r->>'description'), v_price,
             v_proc, coalesce((r->>'coordination')::boolean, false), nullif(btrim(r->>'cup'), ''),
             coalesce((r->>'institutional')::boolean, false), coalesce((r->>'occasional')::boolean, false),
             nullif(btrim(r->>'initiator'), ''), nullif(btrim(r->>'protocol'), ''),
             nullif(btrim(r->>'note'), ''));
      if found then n_upd := n_upd + 1; end if;

      -- winning supplier
      if nullif(btrim(r->>'supplier'), '') is not null then
        select winner_offer_id into oid from pas.requests where id = rid;
        if oid is null then
          insert into pas.offers (request_id, supplier, price)
          values (rid, btrim(r->>'supplier'), v_price) returning id into oid;
          update pas.requests set winner_offer_id = oid where id = rid;
        else
          update pas.offers set supplier = btrim(r->>'supplier'), price = v_price
          where id = oid and (supplier, price) is distinct from (btrim(r->>'supplier'), v_price);
        end if;
      end if;
    end if;
  end loop;

  insert into pas.settings (key, value) values ('ir_sync_last', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
  on conflict (key) do update set value = excluded.value, updated_at = now();

  return jsonb_build_object('inserted', n_ins, 'updated', n_upd, 'skipped', n_skip);
end;
$$;

revoke all on function pas.sync_ir_register(text, jsonb) from public;
-- called from the Apps Script with the project's publishable (anon) key + the secret token
grant execute on function pas.sync_ir_register(text, jsonb) to anon, authenticated, service_role;
