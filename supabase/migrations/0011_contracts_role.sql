-- PAS — dedicated role for the Contracts module.
-- Split into its own migration (0011) because a new enum value can't be used
-- in the same transaction/script that adds it — 0012 does the actual policy
-- change, same pattern as 0009 (added 'annullato') -> 0010 (used it).
alter type app_role add value if not exists 'CONTRACTS';
