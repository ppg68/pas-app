-- PAS — auth wiring: profilo automatico alla registrazione + dominio email ristretto.
-- Da applicare dopo 0001_init.sql.

-- === Dominio email ristretto ===
-- Blocca la creazione dell'utente Supabase Auth stesso (non solo il profilo),
-- così non restano account "orfani" senza riga in profiles.
create or replace function restrict_email_domain()
returns trigger as $$
begin
  if new.email is null or new.email !~* '@istituto-oikos\.org$' then
    raise exception 'Solo indirizzi @istituto-oikos.org sono ammessi in PAS';
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_restrict_email_domain
  before insert on auth.users
  for each row
  execute function restrict_email_domain();

-- === Profilo automatico ===
-- Pattern standard Supabase: quando auth.users riceve una nuova riga (dopo il check
-- sul dominio), creiamo la riga corrispondente in profiles. full_name viene da
-- raw_user_meta_data se presente (es. se in futuro aggiungi un form con nome),
-- altrimenti si usa la parte locale dell'email come placeholder da correggere dopo.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_create_profile
  after insert on auth.users
  for each row
  execute function handle_new_user();

-- === Bootstrap del primo amministratore ===
-- user_roles è protetto da RLS: solo chi ha già ruolo RAC/CAR può assegnare ruoli
-- (vedi 0001_init.sql). La primissima persona va quindi promossa a mano, una tantum,
-- da SQL Editor (che gira come postgres e bypassa RLS) DOPO il suo primo login:
--
--   insert into user_roles (user_id, role)
--   select id, 'RAC' from profiles where email = 'nome.persona@istituto-oikos.org';
--
-- Da lì in poi può assegnare ruoli agli altri dalla pagina Settings → Team.
