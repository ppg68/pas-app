// supabase/functions/notify-signers/index.ts
// Deploy: supabase functions deploy notify-signers
// Called from the server (server action), not from the browser: it uses the service
// role key to read requests/profiles bypassing RLS, and RESEND_API_KEY to send.
//
// Environment variables to set with:
//   supabase secrets set RESEND_API_KEY=xxxx

import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const { requestId, emails, subjectSuffix } = await req.json();
  if (!requestId || !Array.isArray(emails) || emails.length === 0) {
    return new Response(JSON.stringify({ error: "requestId and emails are required" }), {
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
    return new Response(JSON.stringify({ error: error?.message ?? "request not found" }), {
      status: 404,
    });
  }

  const subject = `${r.code} awaiting your ${subjectSuffix}`;
  const body = [
    `Hello,`,
    ``,
    `Request ${r.code} (${r.description || "no description"}) is awaiting your ${subjectSuffix}.`,
    ``,
    `Project: ${r.project_code}${r.budget_line ? " / " + r.budget_line : ""}`,
    `Amount: ${r.estimated_price} ${r.currency}`,
    ``,
    `Log in to PAS to sign.`,
  ].join("\n");

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "PAS <pas@istituto-oikos.org>", // domain to be verified on Resend before use
      to: emails,
      subject,
      text: body,
    }),
  });

  if (!resendRes.ok) {
    const detail = await resendRes.text();
    return new Response(JSON.stringify({ error: `send failed: ${detail}` }), { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
