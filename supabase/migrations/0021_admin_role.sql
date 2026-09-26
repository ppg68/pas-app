-- PAS — ADMIN role: the only one allowed to open Team and assign roles.
-- Own migration because a new enum value can't be used in the script that adds it
-- (same pattern as 0011 -> 0012). Run 0022 right after this one.
alter type app_role add value if not exists 'ADMIN';
