-- PAS 0045: Terms of Reference (Termini di Riferimento) of a trip.
--
-- One free text area where the requester pastes the TDR of the mission (project, activities, objectives and
-- final result); whoever prepares the supporting documents copies it from the sheet. No file is produced.
-- For the trips already in PAS the text is built from the two fields of the first version.
-- Apply with psql / SQL Editor (NOT `supabase db push`). Run after pas_0044.

alter table pas.trip_requests add column if not exists tdr text;

update pas.trip_requests
   set tdr = nullif(btrim(concat_ws(E'\n\n',
         case when activities is not null and btrim(activities) <> ''
              then E'Attività nell’ambito del progetto o dell’incarico:\n' || activities end,
         case when objective is not null and btrim(objective) <> ''
              then E'Obiettivi e Risultato Finale nell’ambito del progetto o dell’incarico:\n' || objective end
       )), '')
 where tdr is null;
