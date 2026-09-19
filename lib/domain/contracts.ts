// Contracts registry — independent from the request/IR workflow in procedures.ts.
// Mirrors the "Elenco contratti" Google Sheet, with payment tranches turned into
// a real one-to-many table instead of the sheet's free-text "condizioni di pagamento".

export type ContractStatus = "in_corso" | "concluso" | "annullato";

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  in_corso: "In corso",
  concluso: "Concluso",
  annullato: "Annullato",
};

// Free text in the DB (the historical sheet has ~18 variants: P.IVA, forfettario,
// P.IVA 22%, R.A., R.A. esente iva, Estero - Autofattura, ...). These are just the
// common ones offered as quick picks in the form; any other value can be typed in.
export const CONTRACT_KIND_SUGGESTIONS = [
  "P.IVA",
  "occasionale",
  "forfettario",
  "R.A.",
  "P.IVA esente R.A",
  "Estero - Autofattura",
];

export interface ContractRow {
  id: string;
  legacy_id: string | null;
  subject: string;
  status: ContractStatus;
  typology: string | null;
  unit: string | null;
  role_title: string | null;
  activity: string | null;
  country: string | null;
  project_code: string | null;
  ir_code: string | null;
  contract_kind: string | null;
  signed_date: string | null;
  start_date: string | null;
  end_date: string | null;
  project_deadline: string | null;
  currency: string;
  amount: number;
  payment_terms: string | null;
  signed: boolean;
  privacy: boolean;
  code_of_conduct: boolean;
  psea_policy: boolean;
  criminal_record_check: boolean;
  technical_requirements_check: boolean;
  labor_inspectorate_notice: boolean;
  referent: string | null;
  notes: string | null;
  created_at: string;
}

export interface TrancheRow {
  id: string;
  contract_id: string;
  seq: number;
  label: string | null;
  amount: number;
  due_date: string | null;
  due_condition: string | null;
  paid: boolean;
  paid_date: string | null;
  paid_amount: number | null;
  notes: string | null;
}

/** Sum of what's actually been paid across a contract's tranches (paid_amount falls back to amount). */
export function totalPaid(tranches: Pick<TrancheRow, "paid" | "amount" | "paid_amount">[]): number {
  return tranches
    .filter((t) => t.paid)
    .reduce((sum, t) => sum + (t.paid_amount ?? t.amount ?? 0), 0);
}

export function totalScheduled(tranches: Pick<TrancheRow, "amount">[]): number {
  return tranches.reduce((sum, t) => sum + (t.amount ?? 0), 0);
}

/** Days until a deadline (negative = overdue), or null if no date set. */
export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const ms = new Date(dateStr).getTime() - new Date(new Date().toDateString()).getTime();
  return Math.round(ms / 86_400_000);
}

/** DB dates are stored as YYYY-MM-DD; displayed in Italian order, DD/MM/YYYY. */
export function formatDateIT(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}/${m}/${y}`;
}

/** Amounts always shown with exactly 2 decimals, Italian grouping (1.234,56).
 *  useGrouping is passed explicitly — leaving it out silently drops the "."
 *  thousands separator for it-IT specifically on some ICU builds. */
export function formatMoney(n: number): string {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  });
}
