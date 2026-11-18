-- PAS 0055: payment proof (quietanza) of an expense row, uploaded next to the receipt.
-- expense_files.kind: 'receipt' (the expense document, as until now) or 'payment_proof' (the quietanza).
-- Apply with psql / SQL Editor (NOT `supabase db push`). Run after pas_0054.

alter table pas.expense_files add column if not exists kind text not null default 'receipt'
  check (kind in ('receipt', 'payment_proof'));

notify pgrst, 'reload schema';
