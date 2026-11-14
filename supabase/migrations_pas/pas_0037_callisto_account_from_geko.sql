-- PAS 0037: fills pas.profiles.callisto_account from Geko Sede ("Codice anagrafica Callisto" = contracts.code_callisto,
-- e.g. D39). The person is matched by the email of the Geko person, or by the name of the Geko person
-- (same words in any order: "Gioffreda Pierpaolo" ~ "Pierpaolo Gioffreda"). For people with several contracts
-- the one active today is used (started and not ended), otherwise the latest already started, then the latest. Only empty accounts are filled. Re-runnable.
-- People not matched stay empty: enter them in Settings > Team.

with c as (
  select ct.code_callisto, p.full_name as account_name, ct.start_date, ct.end_date, lower(p.email) as email,
         (select array_agg(w order by w) from unnest(regexp_split_to_array(lower(btrim(regexp_replace(p.full_name, '[^[:alpha:]]+', ' ', 'g'))), ' ')) w where w <> '') as words
    from geko_sede.contracts ct
    left join geko_sede.people p on p.id = ct.person_id
   where nullif(btrim(ct.code_callisto), '') is not null
), m as (
  select pr.id, pr.full_name, pr.callisto_account as now_acc, c.code_callisto, c.account_name, c.start_date, c.end_date,
         row_number() over (
           partition by pr.id
           order by ((c.start_date is null or c.start_date <= current_date) and (c.end_date is null or c.end_date >= current_date)) desc,
                    (c.start_date is null or c.start_date <= current_date) desc, c.start_date desc nulls last
         ) as rn
    from pas.profiles pr
    join c on (c.email is not null and c.email = lower(pr.email))
           or (select array_agg(w order by w) from unnest(regexp_split_to_array(lower(btrim(regexp_replace(pr.full_name, '[^[:alpha:]]+', ' ', 'g'))), ' ')) w where w <> '') <@ c.words
           or c.words <@ (select array_agg(w order by w) from unnest(regexp_split_to_array(lower(btrim(regexp_replace(pr.full_name, '[^[:alpha:]]+', ' ', 'g'))), ' ')) w where w <> '')
)
update pas.profiles pr
   set callisto_account = upper(btrim(m.code_callisto))
  from m
 where m.id = pr.id and m.rn = 1
   and coalesce(btrim(pr.callisto_account), '') = '';

-- check
select full_name, callisto_account from pas.profiles order by full_name;
