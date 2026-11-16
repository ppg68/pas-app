-- PAS 0044: trip costs charged to one or more projects.
--
-- Every cost of a trip (daily compensation, per diem, board and lodging expenses, plane ticket, visa, insurance,
-- train / hotel booked by Logistics) is charged to one or more rows of (project code, budget line, share %);
-- the shares of each cost add up to 100. The rows are stored in trip_requests.allocations as a JSON array:
--   [{"cost_type": "flight", "project_code": "178IT", "budget_line": "03.01", "share": 60}, ...]
-- The single budget line fields of the first version are copied into the new column for the existing trips.
-- Apply with psql / SQL Editor (NOT `supabase db push`). Run after pas_0043.

alter table pas.trip_requests add column if not exists allocations jsonb not null default '[]'::jsonb;

update pas.trip_requests t
   set allocations = coalesce((
     select jsonb_agg(x)
       from (
         select jsonb_build_object('cost_type', 'compensation', 'project_code', t.internal_code, 'budget_line', t.compensation_bl, 'share', 100) as x
          where t.compensation_charged and t.compensation_bl is not null
         union all
         select jsonb_build_object('cost_type', 'per_diem', 'project_code', t.internal_code, 'budget_line', t.per_diem_bl, 'share', 100)
          where t.lodging_mode = 'per_diem' and t.per_diem_bl is not null
         union all
         select jsonb_build_object('cost_type', 'expenses', 'project_code', t.internal_code, 'budget_line', t.expenses_bl, 'share', 100)
          where t.expenses_bl is not null
         union all
         select jsonb_build_object('cost_type', 'flight', 'project_code', t.internal_code, 'budget_line', t.flights_bl, 'share', 100)
          where t.flights_needed and t.flights_bl is not null
         union all
         select jsonb_build_object('cost_type', 'visa', 'project_code', t.internal_code, 'budget_line', t.visa_bl, 'share', 100)
          where t.visa_needed and t.visa_bl is not null
         union all
         select jsonb_build_object('cost_type', 'insurance', 'project_code', t.internal_code, 'budget_line', t.insurance_bl, 'share', 100)
          where t.insurance = 'oikos' and t.insurance_bl is not null
       ) s
   ), '[]'::jsonb)
 where t.allocations = '[]'::jsonb;
