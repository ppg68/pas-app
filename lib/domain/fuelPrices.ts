export type FuelKey = "petrol" | "diesel" | "lpg";
export type FuelPriceRow = { week_start: string; petrol: number | null; diesel: number | null; lpg: number | null };

export const FUELS: { key: FuelKey; label: string }[] = [
  { key: "petrol", label: "Petrol" },
  { key: "diesel", label: "Diesel" },
  { key: "lpg", label: "LPG" },
];

/** Normalises the free text stored in expense_reports.fuel ("Petrol", "benzina", "gasolio"...) to a fuel key. */
export function fuelKey(text: string | null | undefined): FuelKey | null {
  const t = (text ?? "").trim().toLowerCase();
  if (!t) return null;
  if (/benz|petrol|gasoline|essence|gasolina/.test(t)) return "petrol";
  if (/gasol|diesel|gazole/.test(t)) return "diesel";
  if (/gpl|lpg/.test(t)) return "lpg";
  return null;
}

/** ACI weekly price (EUR per litre) for the week of `date` (YYYY-MM-DD): the latest week starting on or before it,
 *  at most 13 days earlier. Returns "" when not available. */
export function aciPrice(prices: FuelPriceRow[], date: string, fuel: FuelKey | null): string {
  if (!date || !fuel) return "";
  let best: FuelPriceRow | null = null;
  for (const p of prices) if (p.week_start <= date && (!best || p.week_start > best.week_start)) best = p;
  if (!best) return "";
  const days = (Date.parse(date) - Date.parse(best.week_start)) / 86400000;
  const v = best[fuel];
  return v != null && days <= 13 ? String(v) : "";
}
