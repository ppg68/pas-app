-- PAS 0058: "Credit card" as a payment type of the payment authorization (online / card purchases, often advances).
-- Apply with psql / SQL Editor (NOT `supabase db push`). Run after pas_0057.

alter table pas.payment_authorizations drop constraint if exists payment_authorizations_payment_type_check;
alter table pas.payment_authorizations
  add constraint payment_authorizations_payment_type_check
  check (payment_type in ('bank_transfer', 'cash', 'credit_card', 'other'));

notify pgrst, 'reload schema';
