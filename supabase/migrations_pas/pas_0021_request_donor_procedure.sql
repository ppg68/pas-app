-- Donor procedure on the IR (free text, optional). Run after pas_0020. Nothing outside schema pas is touched.
alter table pas.requests add column if not exists donor_procedure text;
