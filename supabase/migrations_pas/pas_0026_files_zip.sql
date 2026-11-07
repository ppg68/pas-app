-- PAS 0026: ZIP files (zipped folders) can be uploaded in "Procedure files". They stay ZIP on the server.
-- Only the allowed types of the existing bucket are extended (max size stays 20 MB). Run after pas_0024.

update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct t)
  from unnest(
    coalesce(allowed_mime_types, array[]::text[]) ||
    array['application/zip', 'application/x-zip-compressed']
  ) as t
)
where id = 'pas-request-files';
