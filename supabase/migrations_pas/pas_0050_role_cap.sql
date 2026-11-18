-- PAS 0050: new role CAP (Coordinatore Unita' Amministrazione del Personale).
-- When a trip request is approved, the CAP gets an informative email (no action in PAS).
-- Apply with psql / SQL Editor (NOT `supabase db push`). Run after pas_0049.

alter type pas.app_role add value if not exists 'CAP';
