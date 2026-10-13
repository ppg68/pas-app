import { headers } from "next/headers";
import type { createClient } from "@/lib/supabase/server";
import { sendEmail, escapeHtml } from "@/lib/notify";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * An invoice has been linked to an IR request: tell everyone involved in the procedure that the
 * invoice has arrived and they can proceed with the payment authorization.
 * Recipients: the person who compiled the request (Budget Holder / PM), the designated approvers
 * (CAR / RAC), whoever already signed it, and the PM / CAR assigned to the project. The person who
 * entered the invoice is left out. Best effort: an email problem never blocks the invoice.
 */
export async function notifyInvoiceArrived(params: {
  supabase: Supabase;
  requestId: string;
  enteredBy: string | null;
  supplier: string | null;
  amount: number;
  currency: string;
}) {
  const { supabase, requestId, enteredBy, supplier, amount, currency } = params;
  try {
    const { data: req } = await supabase
      .from("requests")
      .select("code, description, stage, project_code, initiated_by")
      .eq("id", requestId)
      .maybeSingle();
    if (!req) return;

    const [{ data: approvers }, { data: signatures }, { data: assignment }] = await Promise.all([
      supabase.from("request_approvers").select("user_id").eq("request_id", requestId),
      supabase.from("signatures").select("signed_by").eq("request_id", requestId),
      req.project_code
        ? supabase
            .from("project_assignments")
            .select("pm_user_id, car_user_id")
            .eq("project_code", req.project_code)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const ids = new Set<string>();
    const add = (id: string | null | undefined) => {
      if (id && id !== enteredBy) ids.add(id);
    };
    add(req.initiated_by);
    (approvers ?? []).forEach((a) => add(a.user_id));
    (signatures ?? []).forEach((s) => add(s.signed_by));
    add(assignment?.pm_user_id);
    add(assignment?.car_user_id);
    if (ids.size === 0) return;

    const { data: profiles } = await supabase
      .from("profiles")
      .select("full_name, email")
      .in("id", Array.from(ids));

    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    const link = host ? `${proto}://${host}/requests/${requestId}` : "";

    const nextStep =
      req.stage === "payment"
        ? "<p>The request is in the payment stage: the Budget Holder can now fill in the payment data (payment authorization).</p>"
        : "<p>The request has not reached the payment stage yet: complete the offers, the winner and the documents first, then go to payment and fill in the payment data.</p>";

    for (const p of profiles ?? []) {
      if (!p.email) continue;
      await sendEmail({
        to: p.email,
        subject: `IR ${req.code}: invoice received`,
        html: `<p>Hello ${escapeHtml(p.full_name)},</p>
<p>An invoice has been registered for this internal request. You can proceed with the payment authorization:</p>
<p><b>${escapeHtml(req.code)}</b><br>${escapeHtml(req.description)}</p>
<p>Invoice: ${escapeHtml(supplier ?? "supplier n/a")} — ${amount} ${escapeHtml(currency)}</p>
${nextStep}
${link ? `<p><a href="${link}">Open the request in PAS</a></p>` : ""}`,
      });
    }
  } catch {
    // notification is best effort
  }
}
