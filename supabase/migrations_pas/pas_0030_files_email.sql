-- PAS 0030: saved e-mails (.eml, .msg) can be uploaded in "Procedure files" (e.g. quotation requests / received).
-- Only the allowed types of the existing bucket are extended (max size stays 20 MB). Run after pas_0029.

update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct t)
  from unnest(
    coalesce(allowed_mime_types, array[]::text[]) ||
    array['message/rfc822', 'application/vnd.ms-outlook']
  ) as t
)
where id = 'pas-request-files';
