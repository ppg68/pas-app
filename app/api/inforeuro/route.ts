import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// InforEuro monthly accounting rate of the European Commission (foreign units per 1 EUR) for the month of the
// receipt date. Used by the currency conversion of the expense reports. Rates of a month are kept in memory.

type Month = { rates: Record<string, number>; at: number };
const cache = new Map<string, Month>();
const TTL = 6 * 3600 * 1000;

async function monthRates(year: number, month: number): Promise<Record<string, number> | null> {
  const key = `${year}-${month}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.rates;
  const res = await fetch(`https://ec.europa.eu/budg/inforeuro/api/public/monthly-rates?year=${year}&month=${month}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const list = (await res.json()) as { isoA3Code: string; value: number }[];
  if (!Array.isArray(list) || list.length === 0) return null;
  const rates: Record<string, number> = {};
  for (const x of list) if (x.isoA3Code && typeof x.value === "number") rates[x.isoA3Code] = x.value;
  cache.set(key, { rates, at: Date.now() });
  return rates;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const u = new URL(req.url);
  const currency = (u.searchParams.get("currency") ?? "").trim().toUpperCase();
  const date = u.searchParams.get("date") ?? "";
  if (!/^[A-Z]{3}$/.test(currency)) return Response.json({ error: "Enter the 3-letter currency code (e.g. USD)." }, { status: 400 });
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
  if (!m) return Response.json({ error: "Enter the date of the receipt first." }, { status: 400 });

  try {
    let year = Number(m[1]);
    let month = Number(m[2]);
    // a month not published yet: use the latest one available
    for (let tries = 0; tries < 3; tries++) {
      const rates = await monthRates(year, month);
      if (rates) {
        const rate = rates[currency];
        if (!rate) return Response.json({ error: `InforEuro has no rate for ${currency}. Type the rate.` }, { status: 404 });
        return Response.json({ rate, year, month });
      }
      month -= 1;
      if (month === 0) {
        month = 12;
        year -= 1;
      }
    }
    return Response.json({ error: "InforEuro rates not available for that month. Type the rate." }, { status: 404 });
  } catch {
    return Response.json({ error: "InforEuro did not answer. Type the rate." }, { status: 502 });
  }
}
