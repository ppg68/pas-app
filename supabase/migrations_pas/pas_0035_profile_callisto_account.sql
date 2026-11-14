-- PAS 0035: Callisto account of each person (the creditor account used for the expense report import,
-- same account as in the payroll import, e.g. D136). Filled by the ADMIN in Settings > Team.
-- Existing policies (ADMIN updates profiles) already cover the column. Apply with psql / SQL Editor.
alter table pas.profiles add column if not exists callisto_account text;
