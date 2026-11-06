-- PAS — files of an IR procedure (requests for quotation, offers, contract, invoice, proof of payment ...).
-- Users upload PDFs/images in the PAS (Storage bucket "pas-request-files", max 20 MB each). While the
-- procedure is open the files live here, so approvers see everything in one place. When the procedure is
-- closed (archive_requested_at set by the administration), a script on the office PC moves the files to the
-- server folders (Y:\...\<IR>\ and, for invoices/proofs, X:\...\<protocol>\) and then deletes them from Storage
-- (archived_at is set). Run after pas_0023. Only NEW objects are created; the data already in schema pas is untouched.

-- ------------------------------------------------------------ requests: archive flag
alter table pas.requests
  add column if not exists archive_requested_at timestamptz,
  add column if not exists archive_requested_by uuid references pas.profiles(id),
  add column if not exists archive_done_at timestamptz;

-- ------------------------------------------------------------ files
create table pas.request_files (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references pas.requests(id) on delete cascade,
  doc_key text not null,            -- '01'..'10', see FOLDER_NAMES in lib/domain/procedures.ts
  file_name text not null,
  storage_path text not null unique, -- path inside the bucket
  size_bytes bigint not null,
  mime_type text,
  protocol text,                     -- accounting protocol (Callisto): required on invoice (07) and proof of payment (10)
  uploaded_by uuid references pas.profiles(id),
  uploaded_at timestamptz not null default now(),
  archived_at timestamptz,           -- set by the archive script once the file is on the server
  archived_path text
);

create index idx_request_files_request on pas.request_files(request_id);

alter table pas.request_files enable row level security;

-- Everything is visible to people with a role in the PAS (approvers, administration, contracts) and to the
-- creator of the request. Other signed-in users of the shared project see nothing.
create policy "read request files" on pas.request_files for select
  using (
    pas.is_member(auth.uid())
    or exists (select 1 from pas.requests r where r.id = request_id and r.initiated_by = auth.uid())
  );

-- Anyone who can act on the request (PAS member or its creator) can add files.
create policy "add request files" on pas.request_files for insert
  with check (
    uploaded_by = auth.uid()
    and (
      pas.is_member(auth.uid())
      or exists (select 1 from pas.requests r where r.id = request_id and r.initiated_by = auth.uid())
    )
  );

-- The uploader (or an administrator) can remove a file that is not yet archived, or fix its protocol.
create policy "update request files" on pas.request_files for update
  using (archived_at is null and (uploaded_by = auth.uid() or pas.is_admin(auth.uid()) or pas.has_contracts_access(auth.uid())))
  with check (archived_at is null);

create policy "delete request files" on pas.request_files for delete
  using (archived_at is null and (uploaded_by = auth.uid() or pas.is_admin(auth.uid())));

grant select, insert, update, delete on pas.request_files to authenticated, service_role;

-- ------------------------------------------------------------ Storage bucket (private)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pas-request-files', 'pas-request-files', false, 20971520,
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Policy names start with pas_ because storage.objects is shared with the other apps of this project.
create policy "pas_files_upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pas-request-files'
    and (
      pas.is_member(auth.uid())
      or exists (select 1 from pas.requests r
                  where r.id::text = split_part(name, '/', 1) and r.initiated_by = auth.uid())
    )
  );

-- Read only objects that are registered in pas.request_files AND visible to the user under that table's RLS.
create policy "pas_files_read" on storage.objects for select to authenticated
  using (bucket_id = 'pas-request-files'
         and exists (select 1 from pas.request_files f where f.storage_path = name));

-- The uploader can delete their own not-yet-registered/unarchived object (the app removes the row first).
create policy "pas_files_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'pas-request-files' and owner = auth.uid());
