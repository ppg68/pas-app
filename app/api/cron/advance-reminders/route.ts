import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { sendEmail, escapeHtml } from "@/lib/notify";
import { ADVANCE_INVOICE_DAYS, isAdvanceOverdue } from "@/lib/domain/advances";

export const dynamic = "force-dynamic";

/**
 * Daily reminder (Vercel Cron, see vercel.json, "Authorization: Bearer $CRON_SECRET") for advance payments still
 * without invoice after ADVANCE_INVOICE_DAYS days: one e-mail to each Budget Holder who prepared them, one digest
 * to Contracts / administration. Each advance is reminded again only after 7 days.
 */
const REPEAT_DAYS = 7;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Response("Missing Supabase settings", { status: 500 });
  const supabase = createClient<Database, "pas">(url, key, { db: { schema: "pas" }, auth: { persistSession: false } });

  const { data } = await supabase
    .from("payment_authorizations")
    .select("id, request_id, beneficiary, amount, currency, prepared_by, authorized_at, created_at, advance_reminder_sent_at")
    .eq("is_advance", true)
    .is("invoice_id", null);
  const now = new Date();
  const due = (data ?? []).filter(
    (a) =>
      isAdvanceOverdue(a, now) &&
      (!a.advance_reminder_sent_at || now.getTime() - new Date(a.advance_reminder_sent_at).getTime() >= REPEAT_DAYS * 86400000)
  );
  if (due.length === 0) return Response.json({ reminded: 0 });

  const reqIds = Array.from(new Set(due.map((a) => a.request_id)));
  const prepIds = Array.from(new Set(due.map((a) => a.prepared_by).filter((v): v is string => !!v)));
  const [{ data: reqs }, { data: preps }, { data: holders }] = await Promise.all([
    supabase.from("requests").select("id, code").in("id", reqIds),
    prepIds.length
      ? supabase.from("profiles").select("id, full_name, email").in("id", prepIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string; email: string | null }[] }),
    supabase.from("user_roles").select("user_id").eq("role", "CONTRACTS"),
  ]);
  const code = (id: string) => (reqs ?? []).find((r) => r.id === id)?.code ?? "—";
  const line = (a: (typeof due)[number]) =>
    `<li><b>${escapeHtml(code(a.request_id))}</b> — ${escapeHtml(a.beneficiary)}, ${a.amount} ${escapeHtml(a.currency)}</li>`;
  const site = process.env.NEXT_PUBLIC_SITE_URL
    ? `<p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/advances">Open the advances list</a></p>`
    : "";

  let sent = 0;
  for (const p of preps ?? []) {
    if (!p.email) continue;
    const mine = due.filter((a) => a.prepared_by === p.id);
    const r = await sendEmail({
      to: p.email,
      subject: `Advance payments without invoice (${mine.length})`,
      html: `<p>Hello ${escapeHtml(p.full_name)},</p><p>These advance payments have no invoice after ${ADVANCE_INVOICE_DAYS} days. Please ask the supplier for it and link it to the payment authorization:</p><ul>${mine.map(line).join("")}</ul>${site}`,
    });
    if (r.ok) sent++;
  }

  const holderIds = (holders ?? []).map((h) => h.user_id);
  if (holderIds.length) {
    const { data: admins } = await supabase.from("profiles").select("full_name, email").in("id", holderIds);
    for (const ad of admins ?? []) {
      if (!ad.email) continue;
      await sendEmail({
        to: ad.email,
        subject: `Advance payments still without invoice (${due.length})`,
        html: `<p>Hello ${escapeHtml(ad.full_name)},</p><p>${due.length} advance payment(s) have no invoice after ${ADVANCE_INVOICE_DAYS} days:</p><ul>${due.map(line).join("")}</ul>${site}`,
      });
    }
  }

  await supabase
    .from("payment_authorizations")
    .update({ advance_reminder_sent_at: now.toISOString() })
    .in("id", due.map((a) => a.id));
  return Response.json({ reminded: due.length, emails: sent });
}
