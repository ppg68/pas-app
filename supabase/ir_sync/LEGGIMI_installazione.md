# Sincronizzazione registro IR → PAS (ogni ora)

Il foglio **IR Purchase list** (scheda **IR**) resta la fonte. Ogni ora uno script invia le righe all'app,
che crea/aggiorna le richieste storiche. Le richieste create dentro l'app non vengono toccate.

La migration `pas_0008_sync_ir_register.sql` è già stata eseguita. Restano 4 passi, da fare una volta sola.

## 1. Crea il token (nel SQL Editor di Supabase)

Progetto `OIKOS_DBP_GKSede_GKLoco_Rico` → SQL Editor → esegui:

```sql
select pas.create_ir_sync_token();
```

Copia il valore che compare (una lunga stringa, **si vede una sola volta**; se lo perdi basta rieseguire la
query: ne crea uno nuovo e il vecchio smette di funzionare). Non incollarlo in chat.

## 2. Incolla lo script nel foglio IR

1. Apri il foglio **IR Purchase list**.
2. Menu **Estensioni → Apps Script**.
3. Cancella il codice di esempio e incolla tutto il contenuto del file `ir_sync.gs` (questa cartella).
4. Salva (icona del dischetto) e dai un nome al progetto, ad esempio *PAS sync IR*.

## 3. Imposta le tre proprietà dello script

In Apps Script: **Impostazioni progetto** (ingranaggio) → **Proprietà dello script** → *Aggiungi proprietà*:

| Proprietà | Valore |
|---|---|
| `SUPABASE_URL` | `https://xxlmbliiktiemwdlbcfn.supabase.co` |
| `SUPABASE_KEY` | la chiave **publishable** (Supabase → Project Settings → API Keys). Inizia con `sb_publishable_` |
| `SYNC_TOKEN` | il token del passo 1 |

## 4. Prova e attiva

1. Nell'editor scegli la funzione **`syncIrRegister`** e premi **Esegui**. Google chiede l'autorizzazione
   (account Oikos → *Consenti*): è normale, lo script legge il foglio e chiama l'app.
2. Apri **Visualizza → Log di esecuzione**: deve comparire
   `Sync IR: ~780 righe inviate → {"inserted":10,"updated":...,"skipped":...}`.
   Alla prima esecuzione `inserted` sono le IR nuove dal 26/09 (circa 10).
3. Scegli la funzione **`installHourlyTrigger`** ed **Esegui** una volta: crea l'esecuzione automatica ogni ora.

## Come si controlla

- In Apps Script, menu **Esecuzioni** mostra ogni esecuzione e gli errori.
- Nell'app, le IR nuove compaiono in **Requests** e nelle fatture inserendo il numero IR (progetto e budget line).
- Per fermare la sincronizzazione: Apps Script → icona orologio (Trigger) → elimina il trigger.

## Regole di sincronizzazione

- Si importano le righe con **numero IR e descrizione**; le altre sono saltate.
- Procedura (DIR/SQ/3Q/SP/TEN): letta dalla colonna "Type of procedure" o dedotta dall'importo.
- Se una riga cambia nel foglio (progetto, budget line, importo, fornitore...) l'app si aggiorna all'ora successiva.
- Se una riga viene cancellata dal foglio, la richiesta resta nell'app.
