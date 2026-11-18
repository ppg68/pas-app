-- PAS 0053: the activation sheet (PR09_1.5 AA14) asks which compensation is charged to the project:
--   gross     = "Compenso lordo o aziendale"
--   contract  = "Compenso giornaliero come da contratto in essere"
-- Apply with psql / SQL Editor (NOT `supabase db push`). Run after pas_0052.

alter table pas.trip_requests add column if not exists compensation_kind text
  check (compensation_kind is null or compensation_kind in ('gross', 'contract'));

notify pgrst, 'reload schema';
