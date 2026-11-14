-- PAS 0036: ACI weekly national average fuel prices (EUR per litre), used to fill in the ACI cost per litre
-- of the mileage rows of the expense reports (price of the week of the travel date, for the fuel used).
-- Source: ACI "Prezzi medi nazionali carburanti" (PDF CarburantiWeb), from 2026-01-05 to 2026-11-02. The ADMIN adds the new weeks
-- in Settings > Fuel prices. Apply with psql / SQL Editor.

create table if not exists pas.fuel_prices (
  week_start date primary key,
  petrol numeric,
  diesel numeric,
  lpg numeric
);

alter table pas.fuel_prices enable row level security;

create policy "staff reads fuel prices" on pas.fuel_prices for select to authenticated using (true);
create policy "admin manages fuel prices" on pas.fuel_prices for all
  using (pas.is_admin(auth.uid())) with check (pas.is_admin(auth.uid()));

grant select, insert, update, delete on pas.fuel_prices to authenticated, service_role;

insert into pas.fuel_prices (week_start, petrol, diesel, lpg) values
  ('2026-01-05', 1.655, 1.644, 0.688),
  ('2026-01-12', 1.627, 1.660, 0.695),
  ('2026-01-19', 1.626, 1.661, 0.693),
  ('2026-01-26', 1.635, 1.673, 0.693),
  ('2026-02-02', 1.642, 1.682, 0.694),
  ('2026-02-09', 1.645, 1.691, 0.693),
  ('2026-02-16', 1.648, 1.695, 0.694),
  ('2026-02-23', 1.655, 1.702, 0.694),
  ('2026-03-02', 1.670, 1.721, 0.697),
  ('2026-03-09', 1.745, 1.869, 0.711),
  ('2026-03-16', 1.819, 2.033, 0.716),
  ('2026-03-23', 1.779, 2.023, 0.691),
  ('2026-03-30', 1.733, 2.033, 0.662),
  ('2026-04-06', 1.762, 2.092, 0.727),
  ('2026-04-13', 1.783, 2.153, 0.798),
  ('2026-04-20', 1.763, 2.115, 0.804),
  ('2026-04-27', 1.732, 2.060, 0.806),
  ('2026-05-04', 1.789, 2.046, 0.817),
  ('2026-05-11', 1.933, 2.020, 0.842),
  ('2026-05-18', 1.937, 1.983, 0.830),
  ('2026-05-25', 1.964, 1.989, 0.820),
  ('2026-06-01', 1.952, 2.019, 0.814),
  ('2026-06-08', 1.921, 1.983, 0.809),
  ('2026-06-15', 1.895, 2.005, 0.791),
  ('2026-06-22', 1.850, 1.949, 0.783),
  ('2026-06-29', 1.812, 1.897, 0.771),
  ('2026-07-06', 1.810, 1.887, 0.774),
  ('2026-07-13', 1.864, 1.957, 0.768),
  ('2026-07-20', 1.910, 2.038, 0.760),
  ('2026-07-27', 1.961, 2.141, 0.758),
  ('2026-08-03', 1.992, 2.090, 0.751),
  ('2026-08-10', 1.993, 2.081, 0.760),
  ('2026-08-17', 1.988, 2.079, 0.771),
  ('2026-08-24', 2.003, 2.115, 0.770),
  ('2026-08-31', 2.017, 2.123, 0.768),
  ('2026-09-07', 2.035, 2.142, 0.769),
  ('2026-09-14', 2.084, 2.191, 0.771),
  ('2026-09-21', 2.141, 2.281, 0.770),
  ('2026-09-28', 2.156, 2.351, 0.770),
  ('2026-10-05', 2.073, 2.273, 0.771),
  ('2026-10-12', 2.021, 2.241, 0.781),
  ('2026-10-19', 2.016, 2.244, 0.786),
  ('2026-10-26', 2.006, 2.247, 0.789),
  ('2026-11-02', 2.001, 2.238, 0.790)
on conflict (week_start) do update set petrol = excluded.petrol, diesel = excluded.diesel, lpg = excluded.lpg;
