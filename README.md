# PAS — da prototipo a web app (Next.js + Supabase + Vercel)

Questi file sono un punto di partenza da copiare dentro un progetto Next.js appena creato.
Non è un progetto completo: sono i pezzi che valeva la pena scrivere prima (logica di
dominio + schema DB + client Supabase), da incollare ed espandere.

## Perché Next.js e non Vite

Con Vite + React ottieni una SPA pura: veloce da avviare, ma l'autenticazione reale
(che nel prototipo manca del tutto — `currentUser` è testo libero) va gestita tutta
lato client, con i token esposti nel browser.

Next.js (App Router) + `@supabase/ssr` gestisce la sessione via cookie httpOnly,
lato server: più adatto quando smetti di fidarti del client per l'identità di chi firma
un'autorizzazione. In più Vercel è fatto dallo stesso team, quindi deploy e preview
branch-by-branch sono a costo zero. Per un'app con ruoli reali e firme che contano,
è la scelta più solida.

## Struttura cartelle proposta

```
pas-app/
  app/
    (auth)/
      login/page.tsx
    (dashboard)/
      layout.tsx                # sidebar, ruolo attivo, nome utente
      page.tsx                  # lista richieste (equivalente pas-list del prototipo)
      requests/
        new/page.tsx            # form nuova richiesta
        [id]/page.tsx           # dettaglio + workflow gates
      settings/
        team/page.tsx           # registro ruoli per persona
        assignments/page.tsx    # PM/CAR per progetto
    layout.tsx
    globals.css
  components/
    requests/                   # RequestList, RequestCard, StageBar, OffersPanel, ecc.
    layout/
    ui/
  lib/
    supabase/
      client.ts                 # incluso qui
      server.ts                 # incluso qui
    domain/
      procedures.ts             # incluso qui — costanti e logica pure, porting 1:1
      workflow.ts                # da scrivere: signIrAuth/signPayment/toggleDoc come
                                  # server actions che chiamano Supabase
  types/
    database.types.ts           # generato con `supabase gen types typescript`
  middleware.ts                 # incluso qui
  supabase/
    migrations/
      0001_init.sql             # incluso qui
  .env.local
```

`lib/domain/procedures.ts` è il pezzo più importante da tenere fedele al prototipo:
soglie, tipi di procedura, documenti richiesti, chi deve firmare cosa. Se PR04 cambia,
si tocca solo questo file.

## Passi pratici

1. **Crea il progetto Next.js**
   ```
   npx create-next-app@latest pas-app --typescript --app --eslint
   cd pas-app
   npm install @supabase/supabase-js @supabase/ssr
   ```
   Copia dentro `pas-app/` i file di questo pacchetto (`lib/domain`, `lib/supabase`,
   `middleware.ts`, `supabase/migrations`).

2. **Crea il progetto Supabase**
   Vai su supabase.com → New project → segna `Project URL` e `anon public key`.
   Mettili in `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxxx
   ```

3. **Applica lo schema**
   Con la Supabase CLI (`npm install -g supabase`):
   ```
   supabase login
   supabase link --project-ref xxxx
   supabase db push
   ```
   oppure incolla `supabase/migrations/0001_init.sql` nel SQL Editor della dashboard
   Supabase ed eseguilo — più veloce per iniziare, la CLI la introduci quando servono
   migrazioni ripetibili in team.

4. **Genera i tipi TypeScript dal DB**
   ```
   supabase gen types typescript --linked > types/database.types.ts
   ```
   così ogni query a Supabase è tipata contro lo schema reale.

5. **Autenticazione**
   Nel prototipo `currentUser` è testo libero — è la parte da sostituire per prima.
   Più semplice per uno staff Oikos: Supabase Auth con Magic Link via email, oppure
   OAuth Google ristretto al dominio `@istituto-oikos.org` (si configura nelle
   impostazioni del provider Google in Supabase). Dopo il primo login, una riga in
   `profiles` + almeno un ruolo in `user_roles` (assegnato a mano da un RAC/CAR reale,
   o seed manuale i primi giorni).

6. **Porta la logica, non solo le schermate**
   Prima di toccare l'interfaccia, verifica che `lib/domain/procedures.ts` produca
   esattamente gli stessi risultati del prototipo su un po' di casi noti (soglie,
   codice IR generato, elenco documenti per tipo procedura). Un test veloce con
   `vitest` qui vale più di qualsiasi schermata.

7. **Collega Vercel**
   ```
   npm install -g vercel
   vercel link
   vercel env add NEXT_PUBLIC_SUPABASE_URL
   vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
   ```
   Push su GitHub → collega il repo su vercel.com → deploy automatico a ogni push,
   preview URL per ogni branch/PR (comodo per farti approvare una modifica al workflow
   prima che vada in produzione).

## Autenticazione e ruoli — ordine dei passi

1. **Applica anche `0002_auth_and_roles.sql`, `0003_hq_counter_lock.sql`** (dopo
   `0001_init.sql`), stesso metodo del punto 3 sopra.
2. **Abilita il provider Email in Supabase** (Authentication → Providers → Email,
   con "Confirm email" attivo — Supabase usa lo stesso meccanismo per il magic link).
3. **Login page**: `app/(auth)/login/page.tsx` — form con un solo campo email, manda
   il link via `supabase.auth.signInWithOtp`. Il controllo sul dominio
   `@istituto-oikos.org` è fatto due volte: un messaggio subito in UI (comodità), e il
   trigger `restrict_email_domain` nel database (quello che conta davvero — rifiuta
   anche una chiamata diretta all'API Supabase, non solo il form).
4. **Callback**: `app/auth/callback/route.ts` scambia il codice per la sessione e
   reindirizza alla dashboard.
5. **Middleware** aggiornato: chi non ha sessione viene rimandato a `/login` su
   qualunque route tranne `/login` e `/auth/callback`.
6. **Primo accesso di ciascuno**: al primo login il trigger `handle_new_user` crea
   automaticamente la riga in `profiles` — ma senza nessun ruolo in `user_roles`,
   quindi non può ancora firmare nulla. Questo è voluto: nessuno ha permessi finché
   qualcuno con RAC/CAR non glieli assegna esplicitamente da Settings → Team.
7. **Sblocco del primo amministratore** (uovo-e-gallina: per assegnare ruoli serve
   già avere RAC o CAR): dopo il tuo primo login, vai nel SQL Editor di Supabase
   (gira come `postgres`, bypassa RLS) ed esegui:
   ```sql
   insert into user_roles (user_id, role)
   select id, 'RAC' from profiles where email = 'tuo.indirizzo@istituto-oikos.org';
   ```
   Da lì assegni tutti gli altri dalla UI in `app/(dashboard)/settings/team/page.tsx`.
8. **Seed del team**: fai accedere una volta ciascuna persona (anche solo per far
   comparire il profilo), poi da Settings → Team assegni i ruoli per email — la form
   rifiuta l'assegnazione se la persona non ha ancora fatto il primo login, con un
   messaggio esplicito invece di creare un ruolo "orfano".

## Le due modifiche confermate

- **Contatore IR con lock**: `next_hq_number()` in `0003_hq_counter_lock.sql` fa
  `SELECT ... FOR UPDATE` sulla riga di `hq_counter` prima di incrementarla — chiamala
  via `supabase.rpc('next_hq_number')` **dentro la stessa server action** che poi
  inserisce la richiesta, non in una chiamata separata, altrimenti il lock si rilascia
  troppo presto e il vantaggio si perde.
- **Notifiche via Edge Function**: `supabase/functions/notify-signers/index.ts` è uno
  scheletro funzionante con Resend (va solo verificato il dominio mittente su Resend
  e impostata `RESEND_API_KEY` con `supabase secrets set`). Sostituisce il `mailto:`
  del prototipo: l'email parte davvero dal server, non dipende dal client di posta
  configurato sul PC di chi clicca "Notifica".

## Cosa cambia rispetto al prototipo (di proposito)

- **Segregazione dei compiti**: nel prototipo è un `alert()` lato client, aggirabile.
  Nello schema qui è anche un trigger Postgres (`enforce_segregation_of_duties`):
  anche una richiesta API diretta, senza passare dalla UI, verrebbe rifiutata.
- **Ruoli**: restano "per persona, non globali" come nel prototipo (`user_roles` è
  una tabella con più righe per utente), ma ora i permessi sono verificati anche via
  RLS, non solo nascondendo pulsanti in UI.
- **Contatore IR (HQ)**: va incrementato dentro una transazione con lock
  (`SELECT ... FOR UPDATE` su `hq_counter`) per evitare che due Budget Holder ottengano
  lo stesso numero creando richieste nello stesso istante — nel prototipo, mono-utente
  in memoria, questo problema non esisteva.
- **Notifiche**: il prototipo apre un `mailto:` lato client. In produzione conviene
  spostarlo su una Edge Function Supabase che invia davvero l'email (es. via Resend),
  altrimenti dipende dal client di posta configurato su ogni PC.

## Cosa NON cambia

Soglie PR04, tipi di procedura, checklist documenti per tipo, chi firma cosa,
downgrade da 3Q a SQ con deroga, doppia numerazione HQ/campo: tutto in
`lib/domain/procedures.ts`, portato 1:1 dal prototipo.
