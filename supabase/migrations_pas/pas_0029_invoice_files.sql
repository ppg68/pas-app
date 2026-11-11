-- The invoice file is uploaded in Invoices (Administration) and shows by itself in folder 07 of the IR.
-- Run after pas_0028. Nothing outside schema pas is touched; new columns are nullable, existing rows unchanged.
alter table pas.invoices
  add column if not exists file_name text,
  add column if not exists file_path text,
  add column if not exists file_size bigint;

-- Invoice files are stored in the same private bucket under invoices/<uuid>/...; whoever can read the invoice
-- can read its file (people on the IR read it through the request_files row created when the IR is linked).
create policy "pas_invoice_files_read" on storage.objects for select to authenticated
  using (bucket_id = 'pas-request-files'
         and exists (select 1 from pas.invoices i where i.file_path = name));
