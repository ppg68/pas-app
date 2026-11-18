export type FuelKey = "petrol" | "diesel" | "lpg" | "methane" | "electricity";
export type FuelPriceRow = {
  week_start: string;
  petrol: number | null;
  diesel: number | null;
  lpg: number | null;
  methane: number | null;
  electricity: number | null;
};

/** The ACI table: petrol, diesel and LPG are priced per litre, methane per kg, electricity per kWh. */
export const FUELS: { key: FuelKey; label: string; unit: string }[] = [
  { key: "petrol", label: "Petrol", unit: "litre" },
  { key: "diesel", label: "Diesel", unit: "litre" },
  { key: "lpg", label: "LPG (autotrazione)", unit: "litre" },
  { key: "methane", label: "Methane (autotrazione)", unit: "kg" },
  { key: "electricity", label: "Electricity", unit: "kWh" },
];

/** "litre", "kg" or "kWh": the unit of the ACI price of a fuel. */
export const fuelUnit = (k: FuelKey | null) => FUELS.find((f) => f.key === k)?.unit ?? "litre";

/** Normalises the free text stored in expense_reports.fuel ("Petrol", "benzina", "gasolio"...) to a fuel key. */
export function fuelKey(text: string | null | undefined): FuelKey | null {
  const t = (text ?? "").trim().toLowerCase();
  if (!t) return null;
  if (/benz|petrol|gasoline|essence|gasolina/.test(t)) return "petrol";
  if (/gasol|diesel|gazole/.test(t)) return "diesel";
  if (/gpl|lpg/.test(t)) return "lpg";
  if (/metan|methane|cng|natural gas/.test(t)) return "methane";
  if (/elettric|electric|ev\b|kwh/.test(t)) return "electricity";
  return null;
}

/** ACI weekly price (EUR per litre, per kg for methane, per kWh for electricity) for the week of `date` (YYYY-MM-DD): the latest week starting on or before it,
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
