// Expense reports: online version of the "Expenses Reimbursement Form" (PR09_1.6_AA06 / AA09).

export type ExpenseStatus = "pending" | "approved" | "registered" | "cancelled";
export type ExpenseSection = "km" | "transport" | "meals" | "equipment" | "invoices";

export const STATUS_LABEL: Record<ExpenseStatus, string> = {
  pending: "Awaiting approval",
  approved: "Awaiting Callisto",
  registered: "Recorded in Callisto",
  cancelled: "Cancelled",
};

/** The sections of the form and the Callisto account of each one. The invoices to Oikos have no account in the
 *  template: fill in `account` here when the administration decides which one to use. */
export const SECTIONS: { key: ExpenseSection; title: string; hint: string; account: string }[] = [
  { key: "km", title: "Mileage reimbursement", hint: "Own car: km x ACI fuel cost per litre / 5", account: "11.10.01" },
  {
    key: "transport",
    title: "Motorway tolls, train, metro, taxi, plane tickets",
    hint: "Receipts of transport expenses",
    account: "11.10.02",
  },
  { key: "meals", title: "Meals and hotels", hint: "Receipts of meals and accommodation", account: "11.10.03" },
  {
    key: "equipment",
    title: "Equipment, tools, stationery, consumables, other project costs",
    hint: "Receipts of purchases",
    account: "11.10.04",
  },
  { key: "invoices", title: "Invoices addressed to Oikos", hint: "Invoices in the name of Istituto Oikos", account: "" },
];
export const SECTION_BY_KEY = Object.fromEntries(SECTIONS.map((s) => [s.key, s])) as Record<
  ExpenseSection,
  (typeof SECTIONS)[number]
>;

export type ExpenseApproval = {
  report_id: string;
  signer_role: "PM" | "RAC";
  user_id: string;
  user_name: string;
  signed_at: string | null;
};

export type ExpenseReportRow = {
  id: string;
  number: string;
  status: ExpenseStatus;
  requested_by: string;
  requester_name: string;
  requester_email: string | null;
  worker_name: string;
  subject: string;
  donor_code: string | null;
  internal_code: string | null;
  trip_id: string | null;
  car_model: string | null;
  fuel: string | null;
  notes: string | null;
  total_eur: number;
  callisto_protocol: string | null;
  registered_by: string | null;
  registered_by_name: string | null;
  registered_at: string | null;
  registration_note: string | null;
  created_at: string;
};

export type ExpenseLineRow = {
  id: string;
  report_id: string;
  section: ExpenseSection;
  seq: number;
  line_date: string | null;
  budget_line: string | null;
  location: string | null;
  motive: string | null;
  km: number | null;
  fuel_price: number | null;
  currency: string;
  amount_orig: number | null;
  exchange_rate: number | null;
  amount_eur: number;
};

export type ExpenseFileRow = {
  id: string;
  report_id: string;
  file_name: string;
  storage_path: string;
  size_bytes: number;
  mime_type: string | null;
  budget_line: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
};

/** A line as typed in the form (numbers kept as strings until saved). */
export type LineInput = {
  section: ExpenseSection;
  line_date: string;
  budget_line: string;
  location: string;
  motive: string;
  km: string;
  fuel_price: string;
  currency: string;
  amount_orig: string;
  exchange_rate: string;
};

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const toNum = (s: string | number | null | undefined) => {
  const v = typeof s === "number" ? s : parseFloat(String(s ?? "").replace(",", "."));
  return Number.isFinite(v) ? v : 0;
};

/** Euro amount of one line: km x (fuel price / 5), or amount in the receipt currency / exchange rate
 *  (InforEuro rates are foreign units per 1 EUR). */
export function lineAmountEur(l: Pick<LineInput, "section" | "km" | "fuel_price" | "currency" | "amount_orig" | "exchange_rate">) {
  if (l.section === "km") return round2((toNum(l.km) * toNum(l.fuel_price)) / 5);
  const amount = toNum(l.amount_orig);
  const cur = (l.currency || "EUR").trim().toUpperCase();
  if (cur === "EUR") return round2(amount);
  const rate = toNum(l.exchange_rate);
  return rate > 0 ? round2(amount / rate) : 0;
}

export const money = (n: number | null | undefined) =>
  n == null ? "" : n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Totals by Callisto account, project and budget line: what the administration records. */
export function callistoSummary(lines: ExpenseLineRow[], internalCode: string | null) {
  const map = new Map<string, { section: ExpenseSection; account: string; project: string; budget_line: string; total: number }>();
  for (const l of lines) {
    const bl = (l.budget_line ?? "").trim();
    const key = `${l.section}|${bl}`;
    const cur = map.get(key) ?? {
      section: l.section,
      account: SECTION_BY_KEY[l.section].account,
      project: internalCode ?? "",
      budget_line: bl,
      total: 0,
    };
    cur.total = round2(cur.total + Number(l.amount_eur));
    map.set(key, cur);
  }
  const order = SECTIONS.map((s) => s.key);
  return [...map.values()].sort(
    (a, b) => order.indexOf(a.section) - order.indexOf(b.section) || a.budget_line.localeCompare(b.budget_line)
  );
}
