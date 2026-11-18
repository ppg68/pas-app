"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Pastes rows of the ACI PDF: "dd/mm/yyyy petrol diesel lpg ..." (comma decimals). */
export async function importFuelPrices(formData: FormData) {
  const text = String(formData.get("rows") || "");
  const rows: { week_start: string; petrol: number; diesel: number; lpg: number; methane?: number; electricity?: number }[] = [];
  for (const m of text.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)(?:[ \t]+([\d.,]+))?(?:[ \t]+([\d.,]+))?/g)) {
    const n = (s: string) => parseFloat(s.replace(",", "."));
    rows.push({
      week_start: `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`,
      petrol: n(m[4]),
      diesel: n(m[5]),
      lpg: n(m[6]),
      // methane (per kg) and electricity (per kWh) only when pasted: the stored values are kept otherwise
      ...(m[7] ? { methane: n(m[7]) } : {}),
      ...(m[8] ? { electricity: n(m[8]) } : {}),
    });
  }
  if (rows.length === 0) redirect("/settings/fuel-prices?error=" + encodeURIComponent("No rows recognised. Paste lines like: 09/11/2026 2,050 2,200 0,770"));
  const supabase = await createClient();
  // one row at a time: a row without methane / electricity must not clear the values already stored for that week
  for (const r of rows) {
    const { error } = await supabase.from("fuel_prices").upsert(r, { onConflict: "week_start" });
    if (error) redirect("/settings/fuel-prices?error=" + encodeURIComponent(error.message));
  }
  revalidatePath("/settings/fuel-prices");
  redirect(`/settings/fuel-prices?ok=${rows.length}`);
}

/** Electricity (EUR per kWh) has no automatic source: one value from a given week onward (the weeks already in the table). */
export async function setElectricityPrice(formData: FormData) {
  const price = parseFloat(String(formData.get("price") || "").replace(",", "."));
  const from = String(formData.get("from") || "");
  if (!Number.isFinite(price) || price <= 0) redirect("/settings/fuel-prices?error=" + encodeURIComponent("Enter the electricity price in euro per kWh, e.g. 0,25."));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) redirect("/settings/fuel-prices?error=" + encodeURIComponent("Enter the date from which the price applies."));
  const supabase = await createClient();
  const { data, error } = await supabase.from("fuel_prices").update({ electricity: price }).gte("week_start", from).select("week_start");
  if (error) redirect("/settings/fuel-prices?error=" + encodeURIComponent(error.message));
  revalidatePath("/settings/fuel-prices");
  redirect(`/settings/fuel-prices?ok=${(data ?? []).length}`);
}
