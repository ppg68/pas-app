# PAS — from prototype to web app (Next.js + Supabase + Vercel)

These files are a starting point to copy into a freshly created Next.js project.
This isn't a complete project: it's the pieces that were worth writing first (domain
logic + DB schema + Supabase client), to be pasted in and expanded.

## Why Next.js and not Vite

With Vite + React you get a pure SPA: fast to spin up, but real authentication
(which is entirely missing in the prototype — `currentUser` is free text) has to be
handled entirely client-side, with tokens exposed in the browser.

Next.js (App Router) + `@supabase/ssr` manages the session via an httpOnly cookie,
server-side: a better fit once you stop trusting the client for the identity of
whoever signs an authorization. Plus Vercel is built by the same team, so deploys
and branch-by-branch previews cost nothing extra. For an app with real roles and
signatures that matter, it's the more solid choice.

## Proposed folder structure

```
pas-app/
  app/
    (auth)/
      login/page.tsx
    (dashboard)/
      layout.tsx                # sidebar, active role, user name
      page.tsx                  # request list (equivalent to the prototype's pas-list)
      requests/
        new/page.tsx            # new request form
        [id]/page.tsx           # detail + workflow gates
      settings/
        team/page.tsx           # per-person role registry
        assignments/page.tsx    # PM/CAR per project
    layout.tsx
    globals.css
  components/
    requests/                   # RequestList, RequestCard, StageBar, OffersPanel, etc.
    layout/
    ui/
  lib/
    supabase/
      client.ts                 # included here
      server.ts                 # included here
    domain/
      procedures.ts             # included here — pure constants and logic, 1:1 port
      workflow.ts                # to be written: signIrAuth/signPayment/toggleDoc as
                                  # server actions that call Supabase
  types/
    database.types.ts           # generated with `supabase gen types typescript`
  middleware.ts                 # included here
  supabase/
    migrations/
      0001_init.sql             # included here
  .env.local
```

`lib/domain/procedures.ts` is the most important piece to keep faithful to the
prototype: thresholds, procedure types, required documents, who must sign what. If
PR04 changes, only this file needs to be touched.

## Practical steps

1. **Create the Next.js project**
   ```
   npx create-next-app@latest pas-app --typescript --app --eslint
   cd pas-app
   npm install @supabase/supabase-js @supabase/ssr
   ```
   Copy the files from this package (`lib/domain`, `lib/supabase`,
   `middleware.ts`, `supabase/migrations`) into `pas-app/`.

2. **Create the Supabase project**
   Go to supabase.com → New project → note down the `Project URL` and `anon public key`.
   Put them in `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxxx
   ```

3. **Apply the schema**
   With the Supabase CLI (`npm install -g supabase`):
   ```
   supabase login
   supabase link --project-ref xxxx
   supabase db push
   ```
   or paste `supabase/migrations/0001_init.sql` into the Supabase dashboard's SQL
   Editor and run it — faster to get started; introduce the CLI once you need
   repeatable migrations as a team.

4. **Generate TypeScript types from the DB**
   ```
   supabase gen types typescript --linked > types/database.types.ts
   ```
   so that every query to Supabase is typed against the real schema.

5. **Authentication**
   In the prototype `currentUser` is free text — this is the first thing to replace.
   The simplest option for Oikos staff: Supabase Auth with Magic Link via email, or
   Google OAuth restricted to the `@istituto-oikos.org` domain (configured in the
   Google provider settings in Supabase). After the first login, a row in
   `profiles` + at least one role in `user_roles` (assigned by hand by a real
   RAC/CAR, or seeded manually in the first few days).

6. **Port the logic, not just the screens**
   Before touching the UI, verify that `lib/domain/procedures.ts` produces exactly
   the same results as the prototype on a set of known cases (thresholds,
   generated IR code, document list per procedure type). A quick test with
   `vitest` here is worth more than any screen.

7. **Connect Vercel**
   ```
   npm install -g vercel
   vercel link
   vercel env add NEXT_PUBLIC_SUPABASE_URL
   vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
   ```
   Push to GitHub → connect the repo on vercel.com → automatic deploy on every push,
   preview URL for every branch/PR (handy for getting a workflow change approved
   before it goes to production).

## Authentication and roles — order of steps

1. **Also apply `0002_auth_and_roles.sql`, `0003_hq_counter_lock.sql`** (after
   `0001_init.sql`), same method as step 3 above.
2. **Enable the Email provider in Supabase** (Authentication → Providers → Email,
   with "Confirm email" enabled — Supabase uses the same mechanism for the magic link).
3. **Login page**: `app/(auth)/login/page.tsx` — a form with a single email field,
   sends the link via `supabase.auth.signInWithOtp`. No domain check: PAS also
   includes signers external to Oikos (see "External access" below).
4. **Callback**: `app/auth/callback/route.ts` exchanges the code for the session and
   redirects to the dashboard.
5. **Updated middleware**: anyone without a session is redirected to `/login` on
   any route except `/login` and `/auth/callback`.
6. **Everyone's first login**: on first login the `handle_new_user` trigger
   automatically creates the row in `profiles` — but with no role in `user_roles`,
   so they can't sign anything yet. This is intentional: no one has permissions
   until someone with RAC/CAR explicitly grants them via Settings → Team.
7. **Unlocking the first administrator** (chicken-and-egg: assigning roles already
   requires having RAC or CAR): after your first login, go to the Supabase SQL
   Editor (runs as `postgres`, bypasses RLS) and run:
   ```sql
   insert into user_roles (user_id, role)
   select id, 'RAC' from profiles where email = 'your.address@istituto-oikos.org';
   ```
   From there you assign everyone else from the UI in `app/(dashboard)/settings/team/page.tsx`.
8. **Seeding the team**: have each person log in once (even just to make their
   profile appear), then assign roles by email from Settings → Team — the form
   rejects the assignment if the person hasn't logged in yet, with an explicit
   message instead of creating an "orphan" role.

## External access

PAS also includes people outside Oikos (consultants, members of partner
organizations) as occasional signers — not just staff with an
`@istituto-oikos.org` email. That's why `0007_remove_email_domain_restriction.sql`
removes the `restrict_email_domain` trigger that was set up in `0002_auth_and_roles.sql`:
anyone can now create an account via magic link with any email.

This is safe because the email domain was never the actual access barrier: the
role in `user_roles` is. On first login `handle_new_user` still only creates a
row in `profiles`, with no role — someone who signs up cannot sign or create
anything until a RAC/CAR assigns them a role via Settings → Team (RLS and the
checks in the server actions block it on every action, not just the UI). Opening
sign-up to anyone just means more possible "inert" accounts, not more
permissions.

## The two confirmed changes

- **IR counter with lock**: `next_hq_number()` in `0003_hq_counter_lock.sql` does
  `SELECT ... FOR UPDATE` on the `hq_counter` row before incrementing it — call it
  via `supabase.rpc('next_hq_number')` **inside the same server action** that then
  inserts the request, not in a separate call, otherwise the lock is released too
  early and the benefit is lost.
- **Notifications via Edge Function**: `supabase/functions/notify-signers/index.ts` is
  a working skeleton using Resend (you just need to verify the sender domain on
  Resend and set `RESEND_API_KEY` with `supabase secrets set`). It replaces the
  prototype's `mailto:`: the email actually goes out from the server, and doesn't
  depend on the mail client configured on the clicking user's PC when they hit
  "Notify".

## What changes compared to the prototype (on purpose)

- **Segregation of duties**: in the prototype this is a client-side `alert()`,
  which can be bypassed. In the schema here it's also a Postgres trigger
  (`enforce_segregation_of_duties`): even a direct API request, bypassing the UI,
  would be rejected.
- **Roles**: they remain "per person, not global" as in the prototype (`user_roles`
  is a table with multiple rows per user), but permissions are now also checked
  via RLS, not just by hiding buttons in the UI.
- **IR (HQ) counter**: must be incremented inside a transaction with a lock
  (`SELECT ... FOR UPDATE` on `hq_counter`) to prevent two Budget Holders from
  getting the same number when creating requests at the same moment — in the
  prototype, single-user and in-memory, this problem didn't exist.
- **Notifications**: the prototype opens a client-side `mailto:`. In production it's
  better to move this to a Supabase Edge Function that actually sends the email
  (e.g. via Resend), otherwise it depends on the mail client configured on each PC.

## What does NOT change

PR04 thresholds, procedure types, document checklist per type, who signs what,
downgrade from 3Q to SQ with derogation, dual HQ/field numbering: all in
`lib/domain/procedures.ts`, ported 1:1 from the prototype.

## Contracts module

A second, independent module living in the same app (same login, same roles):
replaces the "Elenco contratti" Google Sheet, which tracked consultant/supplier
contracts and their payment schedule. Not linked to the `requests` workflow above
— a contract here is its own record, entered directly (or imported from the sheet).

- **Schema**: `supabase/migrations/0008_contracts.sql` — `contracts` (subject,
  status, typology, unit, role, dates, amount, the compliance checklist columns
  from the sheet — Firmato/privacy/Codice di Condotta/PSEA/casellario/etc.) and
  `contract_tranches` (one row per payment tranche: amount, due date or free-text
  condition, paid/unpaid + paid date). Apply it the same way as the others (SQL
  Editor, or `supabase db push`) — **after** `0007_remove_email_domain_restriction.sql`.
  The sheet's "condizioni di pagamento" free text is kept on `contracts.payment_terms`
  for reference, but the source of truth for tracking is now `contract_tranches`.
- **Access**: read is open to any authenticated user; create/edit/delete requires
  the PM, LOG, CAR, or RAC role (same set as document management on requests) —
  see the RLS policies at the bottom of the migration.
- **Pages**: `/contracts` (list, search/sort/status filter/Excel export — same
  pattern as the requests list), `/contracts/new`, `/contracts/[id]` (edit fields,
  toggle compliance checklist, add/remove tranches, mark a tranche paid — computes
  scheduled/paid/balance from the tranches, not from a manually-typed total).
- **Historical import**: `supabase/migrations/0009_contracts_kind_and_status.sql`
  widens the schema to match the real sheet data (adds `annullato` to
  `contract_status`; turns `contract_kind` from a 2-value enum into free text —
  the sheet actually has ~18 variants like "R.A.", "P.IVA esente R.A", "Estero -
  Autofattura"). `0010_import_contracts.sql` then loads the 415 real rows (425
  minus 10 section-header/separator rows in the sheet that aren't contracts).
  Since the sheet only ever tracked one lump "importo pagato" per contract, each
  imported contract gets 1–2 synthesized tranches: a "paid" one for the amount
  already paid (dated to the contract's end date), and/or an unpaid "balance"
  one for the rest — so `contracts`/`contract_tranches` totals reconcile exactly
  with what the sheet showed, without pretending to know the real tranche
  schedule. Original per-row extras that don't have their own column (Impegnato,
  Valutazione performance, Mansione GRUPPI OMOGENEI DVR, non-boolean compliance
  cells like a date instead of "x") are preserved as labeled lines appended to
  `notes`, not dropped. Apply 0009 and 0010 in order, after 0008.
