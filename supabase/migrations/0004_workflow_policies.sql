-- PAS — missing policies to advance the workflow after request creation.
-- 0001_init.sql only covers creation (BH) and reading; without these, no one can
-- add offers or update stage/winner_offer_id/folder_path on `requests`.

-- Procurement staff propose/manage offers during the 'offers' stage.
create policy "PM/LOG/CAR manage offers" on offers for all
  using (exists (select 1 from user_roles where user_id = auth.uid() and role in ('PM','LOG','CAR')));

-- PM/LOG/CAR/RAC advance the stage (closing offers, winner, folder_path,
-- moving to payment, closing). Creation stays BH-only (existing policy).
create policy "PM/LOG/CAR/RAC update requests" on requests for update
  using (exists (select 1 from user_roles where user_id = auth.uid() and role in ('PM','LOG','CAR','RAC')));
