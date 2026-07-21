-- PAS — contatore IR (HQ) con lock, per evitare che due Budget Holder ottengano
-- lo stesso numero creando richieste nello stesso istante.
-- Da chiamare via RPC (supabase.rpc('next_hq_number')) dentro la stessa richiesta
-- che poi inserisce la riga in `requests` — non separatamente, altrimenti il lock
-- si rilascia prima che il numero sia davvero usato.

create or replace function next_hq_number()
returns int as $$
declare
  n int;
begin
  select next_number into n from hq_counter where id = true for update;
  update hq_counter set next_number = n + 1 where id = true;
  return n;
end;
$$ language plpgsql security definer;

-- Chi può crearne una nuova richiesta è già ristretto dalla policy "BH creates
-- requests" su `requests`; questa funzione va comunque eseguita come parte dello
-- stesso flusso (server action), non esposta come endpoint libero.
revoke execute on function next_hq_number() from public;
grant execute on function next_hq_number() to authenticated;
