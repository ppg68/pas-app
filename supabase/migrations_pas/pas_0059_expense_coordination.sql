-- PAS 0059: expense report entirely on the coordination (no budget line needed).
--   expense_reports.coordination   true = all the expenses are on the coordination: the budget line of the rows is optional
-- Apply with psql / SQL Editor (NOT `supabase db push`). Run after pas_0058.

alter table pas.expense_reports add column if not exists coordination boolean not null default false;

notify pgrst, 'reload schema';
