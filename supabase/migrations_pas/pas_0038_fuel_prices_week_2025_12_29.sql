-- PAS 0038: the ACI week of Monday 29/12/2025 also covers 1-4 January 2026 (travel dates of the first days of the year).
insert into pas.fuel_prices (week_start, petrol, diesel, lpg) values ('2025-12-29', 1.679, 1.629, 0.697)
on conflict (week_start) do update set petrol = excluded.petrol, diesel = excluded.diesel, lpg = excluded.lpg;
