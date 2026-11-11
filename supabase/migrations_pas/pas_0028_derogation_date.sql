-- Date of the derogation from the procedure (entered next to the reason on the IR).
-- Run after pas_0027. Nothing outside schema pas is touched; the column is nullable, existing rows unchanged.
alter table pas.requests add column if not exists derogation_date date;
