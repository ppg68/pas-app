-- PAS — support for importing the legacy "IR Purchase list" register.
-- Legacy initiators are mostly not PAS users, so initiated_by must be nullable;
-- the sheet's name / IR number / accounting protocol / notes are kept alongside.
alter table requests alter column initiated_by drop not null;
alter table requests
  add column if not exists is_legacy boolean not null default false,
  add column if not exists legacy_ir_number text,
  add column if not exists legacy_initiator_name text,
  add column if not exists legacy_protocol text,
  add column if not exists legacy_note text;
