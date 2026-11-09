-- Direct purchases (DIR) have no offers, so the supplier is typed on the request itself.
-- It shows in the Requests table and in Elisa's "awaiting invoice" list, to match invoices to IRs.
-- Run after pas_0026. Nothing outside schema pas is touched; the column is nullable, existing rows unchanged.
alter table pas.requests add column if not exists direct_supplier text;
