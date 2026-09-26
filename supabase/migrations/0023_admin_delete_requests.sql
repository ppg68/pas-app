-- PAS — only ADMIN can delete a request (button in the Requests list).
-- Offers, signatures, documents and audit rows go with it (ON DELETE CASCADE);
-- invoices linked to the request keep existing with request_id set to null.
-- Run after 0022_admin_only_team.sql (uses is_admin).
create policy "ADMIN deletes requests" on requests for delete
  using (is_admin(auth.uid()));
