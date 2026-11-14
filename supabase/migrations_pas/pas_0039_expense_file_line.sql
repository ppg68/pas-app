-- PAS 0039: each receipt of an expense report is attached to its expense row (all sections but mileage).
-- Receipts already uploaded by budget line keep line_id null ("other documents").
-- Apply with psql / SQL Editor. Run after pas_0038 (or pas_0037).
alter table pas.expense_files add column if not exists line_id uuid references pas.expense_lines(id) on delete set null;
create index if not exists idx_expense_files_line on pas.expense_files(line_id);
