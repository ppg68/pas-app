-- PAS — policy mancanti per far avanzare il workflow dopo la creazione della richiesta.
-- 0001_init.sql copre solo la creazione (BH) e la lettura; senza queste nessuno può
-- aggiungere offerte o aggiornare stage/winner_offer_id/folder_path su `requests`.

-- Procurement staff propongono/gestiscono le offerte durante lo stage 'offers'.
create policy "PM/LOG/CAR manage offers" on offers for all
  using (exists (select 1 from user_roles where user_id = auth.uid() and role in ('PM','LOG','CAR')));

-- PM/LOG/CAR/RAC fanno avanzare lo stage (chiusura offerte, vincitore, folder_path,
-- passaggio a pagamento, chiusura). La creazione resta BH-only (policy esistente).
create policy "PM/LOG/CAR/RAC update requests" on requests for update
  using (exists (select 1 from user_roles where user_id = auth.uid() and role in ('PM','LOG','CAR','RAC')));
