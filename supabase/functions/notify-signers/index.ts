// supabase/functions/notify-signers/index.ts
// Deploy: supabase functions deploy notify-signers
// Chiamata dal server (server action), non dal browser: usa la service role key
// per leggere requests/profiles bypassando RLS, e la RESEND_API_KEY per inviare.
//
// Variabili d'ambiente da impostare con:
//   supabase secrets set RESEND_API_KEY=xxxx

import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const { requestId, emails, subjectSuffix } = await req.json();
  if (!requestId || !Array.isArray(emails) || emails.length === 0) {
    return new Response(JSON.stringify({ error: "requestId ed emails sono obbligatori" }), {
      status: 400,
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: r, error } = await supabase
    .from("requests")
    .select("code, description, project_code, budget_line, estimated_price, currency, proc_code")
    .eq("id", requestId)
    .single();

  if (error || !r) {
    return new Response(JSON.stringify({ error: error?.message ?? "richiesta non trovata" }), {
      status: 404,
    });
  }

  const subject = `${r.code} in attesa della tua ${subjectSuffix}`;
  const body = [
    `Ciao,`,
    ``,
    `La richiesta ${r.code} (${r.description || "nessuna descrizione"}) è in attesa della tua ${subjectSuffix}.`,
    ``,
    `Progetto: ${r.project_code}${r.budget_line ? " / " + r.budget_line : ""}`,
    `Importo: ${r.estimated_price} ${r.currency}`,
    ``,
    `Accedi a PAS per firmare.`,
  ].join("\n");

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "PAS <pas@istituto-oikos.org>", // dominio da verificare su Resend prima dell'uso
      to: emails,
      subject,
      text: body,
    }),
  });

  if (!resendRes.ok) {
    const detail = await resendRes.text();
    return new Response(JSON.stringify({ error: `invio fallito: ${detail}` }), { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
