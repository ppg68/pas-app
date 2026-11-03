-- Reject a purchase request (IR) at the approval stage: the approver gives a reason, the request is
-- closed as "rejected" and the requester opens a new one with the corrections.
-- Run after pas_0019. Nothing outside schema pas is touched.
-- Note: run the first statement on its own if the editor wraps the script in a transaction.

alter type pas.request_stage add value if not exists 'rejected';

alter table pas.requests
  add column if not exists rejected_reason text,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references pas.profiles(id);
