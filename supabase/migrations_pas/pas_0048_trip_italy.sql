-- PAS 0048: trips in Italy (online "Autorizzazione trasferta singola" PR09_1.6_AA09).
-- The Italy form needs one more choice: which board/lodging reimbursement is authorized.
--   either      = "vitto o alloggio" (receipts for meals OR lodging, or one of them free)
--   both        = "vitto e alloggio" (receipts for meals AND lodging, or both free)
--   expat_exit  = expatriate exit trip for the visa renewal, up to EUR 250
-- Used together with lodging_mode = 'receipts'. Apply with psql / SQL Editor (NOT `supabase db push`).

alter table pas.trip_requests add column if not exists reimb_kind text
  check (reimb_kind is null or reimb_kind in ('either', 'both', 'expat_exit'));
