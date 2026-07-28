-- PAS — fix: profiles e hq_counter erano state create in 0001_init.sql senza mai
-- abilitare Row Level Security (a differenza delle altre tabelle, righe 127-134 di
-- 0001_init.sql). Supabase le segnalava come "rls_disabled_in_public": chiunque
-- conoscesse l'URL del progetto avrebbe potuto leggere/scrivere queste tabelle
-- tramite l'anon key.

alter table profiles enable row level security;
alter table hq_counter enable row level security;

-- profiles: lettura per chiunque sia autenticato (serve per mostrare i nomi nelle
-- richieste/firme), scrittura solo sul proprio profilo.
create policy "authenticated read profiles" on profiles for select
  using (auth.role() = 'authenticated');

create policy "user updates own profile" on profiles for update
  using (id = auth.uid());

-- hq_counter: nessuna policy per gli utenti normali. L'unico punto di accesso resta
-- la funzione next_hq_number() (0003_hq_counter_lock.sql), che gira come
-- security definer e quindi bypassa RLS.
