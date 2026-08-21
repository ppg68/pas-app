-- PAS — removes the email domain restriction on account creation.
--
-- PAS needs to be able to include people outside Oikos too (consultants, members of
-- partner organizations) as occasional signers. The real access barrier remains the
-- role in `user_roles`: anyone who signs up without a role assigned by a RAC/CAR
-- cannot sign or create anything — this is still enforced by the RLS policies and
-- the checks in the server actions (see lib/domain/workflow.ts). The domain filter
-- was therefore just a redundant second gate, not the actual protection.
drop trigger if exists trg_restrict_email_domain on auth.users;
drop function if exists restrict_email_domain();
