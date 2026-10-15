-- Contracts, Compliance checklist:
--  * "Autorizzazione al lavoro Ente Pubblico" (public_body_authorization): new item;
--  * "not necessary": some documents are not required for every contract. compliance_na lists the
--    checklist items (column names) marked as not necessary for the contract; they are not "done"
--    but they are not pending either.
-- Nothing else changes; existing values are untouched. Apply with psql / SQL Editor.

alter table pas.contracts
  add column if not exists public_body_authorization boolean not null default false;

alter table pas.contracts
  add column if not exists compliance_na text[] not null default '{}';
