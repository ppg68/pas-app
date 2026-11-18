import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export const dynamic = "force-dynamic";

/**
 * Weekly national average fuel prices of the Ministry (MASE / DGSAIE open data, the same figures as the ACI table),
 * copied into pas.fuel_prices. Called by Vercel Cron (see vercel.json) with "Authorization: Bearer $CRON_SECRET".
 * The CSV is in euro per 1,000 litres with Italian number format; the table keeps euro per litre (3 decimals).
 * Kept from the week of 2025-12-29 (it covers 1-4 January 2026): 2025 expense reports are no longer accepted.
 */
const SOURCE = "https://sisen.mase.gov.it/dgsaie/api/v1/weekly-prices/report/export?format=CSV&lang=it";
const FROM = "2025-12-29";

const perLitre = (s: string | undefined) => {
  const v = parseFloat((s ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(v) ? Math.round(v) / 1000 : null;
};

/** splits a CSV line with "quoted, fields" */
function cells(line: string) {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Response("Missing Supabase settings", { status: 500 });

  const res = await fetch(SOURCE, { cache: "no-store" });
  if (!res.ok) return new Response(`Source answered ${res.status}`, { status: 502 });
  const lines = (await res.text()).split(/\r?\n/).filter(Boolean);
  const head = cells(lines[0]);
  const iB = head.indexOf("BENZINA");
  const iG = head.indexOf("GASOLIO_AUTO");
  const iL = head.indexOf("GPL");
  const iM = head.indexOf("METANO");
  if (iB < 0 || iG < 0 || iL < 0) return new Response("Unexpected CSV columns", { status: 502 });

  const rows = lines
    .slice(1)
    .map((l) => cells(l))
    .filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c[0]) && c[0] >= FROM)
    .map((c) => ({ week_start: c[0], petrol: perLitre(c[iB]), diesel: perLitre(c[iG]), lpg: perLitre(c[iL]), ...(iM >= 0 && perLitre(c[iM]) != null ? { methane: perLitre(c[iM]) } : {}) }))
    .filter((r) => r.petrol != null && r.diesel != null);
  if (rows.length === 0) return new Response("No rows in the source", { status: 502 });

  const supabase = createClient<Database, "pas">(url, key, { db: { schema: "pas" }, auth: { persistSession: false } });
  const { error } = await supabase.from("fuel_prices").upsert(rows, { onConflict: "week_start" });
  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ saved: rows.length, last: rows[rows.length - 1].week_start });
}
