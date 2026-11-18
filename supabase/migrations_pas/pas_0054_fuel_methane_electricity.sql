-- PAS 0054: methane (EUR per kg) and electricity (EUR per kWh) in the ACI fuel table, for the mileage rows of the
-- expense reports (same table as the ACI "Costi chilometrici" prices: petrol, diesel, LPG per litre, methane per kg,
-- electricity per kWh). Methane comes weekly from the Ministry source used for the other fuels (cron fuel-prices);
-- the weeks already present are filled below. Electricity has no automatic source: the ADMIN pastes the ACI value in
-- Settings > Fuel prices (or the person types it in the row). Apply with psql / SQL Editor (NOT `supabase db push`).

alter table pas.fuel_prices add column if not exists methane numeric;
alter table pas.fuel_prices add column if not exists electricity numeric;

update pas.fuel_prices f set methane = v.m
  from (values
    ('2025-12-29'::date, 1.375),
    ('2026-01-05'::date, 1.379),
    ('2026-01-12'::date, 1.378),
    ('2026-01-19'::date, 1.381),
    ('2026-01-26'::date, 1.386),
    ('2026-02-02'::date, 1.394),
    ('2026-02-09'::date, 1.395),
    ('2026-02-16'::date, 1.392),
    ('2026-02-23'::date, 1.386),
    ('2026-03-02'::date, 1.383),
    ('2026-03-09'::date, 1.416),
    ('2026-03-16'::date, 1.468),
    ('2026-03-23'::date, 1.488),
    ('2026-03-30'::date, 1.518),
    ('2026-04-06'::date, 1.548),
    ('2026-04-13'::date, 1.568),
    ('2026-04-20'::date, 1.569),
    ('2026-04-27'::date, 1.560),
    ('2026-05-04'::date, 1.557),
    ('2026-05-11'::date, 1.549),
    ('2026-05-18'::date, 1.543),
    ('2026-05-25'::date, 1.542),
    ('2026-06-01'::date, 1.545),
    ('2026-06-08'::date, 1.544),
    ('2026-06-15'::date, 1.547),
    ('2026-06-22'::date, 1.546),
    ('2026-06-29'::date, 1.543),
    ('2026-07-06'::date, 1.538),
    ('2026-07-13'::date, 1.535),
    ('2026-07-20'::date, 1.548),
    ('2026-07-27'::date, 1.573),
    ('2026-08-03'::date, 1.592),
    ('2026-08-10'::date, 1.613),
    ('2026-08-17'::date, 1.629),
    ('2026-08-24'::date, 1.637),
    ('2026-08-31'::date, 1.648),
    ('2026-09-07'::date, 1.679),
    ('2026-09-14'::date, 1.751),
    ('2026-09-21'::date, 1.784),
    ('2026-09-28'::date, 1.813),
    ('2026-10-05'::date, 1.829),
    ('2026-10-12'::date, 1.853),
    ('2026-10-19'::date, 1.865),
    ('2026-10-26'::date, 1.871),
    ('2026-11-02'::date, 1.880),
    ('2026-11-09'::date, 1.883),
    ('2026-11-16'::date, 1.898)
  ) as v(w, m)
 where f.week_start = v.w;

notify pgrst, 'reload schema';
