-- PAS — widen the Contracts schema to match the real "Elenco contratti" data,
-- discovered while preparing the historical import (425 rows).
-- Apply after 0008_contracts.sql, before importing the historical data.

-- The sheet has a third status ("Annullato") beyond in_corso/concluso.
alter type contract_status add value if not exists 'annullato';

-- contract_kind turned out to have ~18 free-text variants in real data
-- (P.IVA, forfettario, P.IVA 22%, R.A., P.IVA esente R.A, Estero - Autofattura, ...),
-- not a clean binary — store it as free text instead of a 2-value enum.
alter table contracts alter column contract_kind type text using contract_kind::text;
drop type if exists contract_kind;
