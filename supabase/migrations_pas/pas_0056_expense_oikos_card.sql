-- PAS 0056: expenses paid with the Oikos credit card. The row stays in the report (and in its total) but is not reimbursed.
--   expense_lines.paid_with_card     row paid with the company card
--   expense_reports.total_eur        TOTAL TO BE REIMBURSED (rows not paid with the card), as before for existing reports
--   expense_reports.total_card_eur   TOTAL PAID WITH OIKOS CREDIT CARD
-- Apply with psql / SQL Editor (NOT `supabase db push`). Run after pas_0055.

alter table pas.expense_lines add column if not exists paid_with_card boolean not null default false;
alter table pas.expense_reports add column if not exists total_card_eur numeric not null default 0;

notify pgrst, 'reload schema';
