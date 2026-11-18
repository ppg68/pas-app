-- PAS 0049: data for the mission assignment letter (lettera di incarico, PR09 AA04-AA07) generated from the trip sheet.
-- letter = {"birth_place","birth_date","residence","tax_code","profile","daily_fee","extra_fee","contract_fee"}
-- Apply with psql / SQL Editor (NOT `supabase db push`). Run after pas_0048.

alter table pas.trip_requests add column if not exists letter jsonb not null default '{}'::jsonb;
