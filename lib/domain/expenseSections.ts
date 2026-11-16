import type { PdfSection } from "@/lib/domain/requestPdf";
import {
  SECTIONS,
  STATUS_LABEL,
  callistoSummary,
  money,
  type ExpenseApproval,
  type ExpenseFileRow,
  type ExpenseLineRow,
  type ExpenseReportRow,
} from "@/lib/domain/expenses";

const dt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "");
const d = (s: string | null | undefined) => (s ? new Date(s + "T00:00:00").toLocaleDateString("it-IT") : "");

/** Sections of the expense report, shown on the page and printed in the PDF (one source for both). */
export function expenseSections(
  r: ExpenseReportRow,
  lines: ExpenseLineRow[],
  approvals: ExpenseApproval[],
  files: ExpenseFileRow[],
  tripNumber: string | null
): { header: PdfSection; lines: PdfSection[]; summary: PdfSection; history: PdfSection } {
  const header: PdfSection = {
    title: "Report",
    rows: [
      ["Worker", r.worker_name],
      ["Filed on behalf by", r.worker_id && r.worker_id !== r.requested_by ? r.requester_name : ""],
      ["Object of the expenses", r.subject],
      ["Related trip", tripNumber ?? ""],
      ["Donor project code", r.donor_code ?? ""],
      ["Internal project code", r.internal_code ?? ""],
      ["Car / fuel", [r.car_model, r.fuel].filter(Boolean).join(" - ")],
      ["Notes", r.notes ?? ""],
      ["Total to be reimbursed", `EUR ${money(r.total_eur)}`],
    ],
  };

  const sectionRows: PdfSection[] = [];
  for (const sec of SECTIONS) {
    const ls = lines.filter((l) => l.section === sec.key).sort((a, b) => a.seq - b.seq);
    if (ls.length === 0) continue;
    const sub = ls.reduce((s, l) => s + Number(l.amount_eur), 0);
    sectionRows.push({
      title: `${sec.title}${sec.account ? ` (${sec.account})` : ""}`,
      rows: [
        ...ls.map((l) => {
          const label = `${d(l.line_date)} - BL ${l.budget_line ?? "?"}`;
          const where = [l.location, l.motive].filter(Boolean).join(" - ");
          const detail =
            sec.key === "km"
              ? `${l.km} km x ${money(Number(l.fuel_price) / 5)} EUR/km (ACI ${l.fuel_price} / 5)`
              : l.currency !== "EUR"
                ? `${money(l.amount_orig)} ${l.currency} at ${l.exchange_rate}`
                : "";
          return [label, `${where}${detail ? ` (${detail})` : ""}: EUR ${money(Number(l.amount_eur))}`] as [string, string];
        }),
        ["Subtotal", `EUR ${money(sub)}`],
      ],
    });
  }

  const summary: PdfSection = {
    title: "Summary for Callisto",
    rows: callistoSummary(lines, r.internal_code).map((s) => [
      `${s.account || "no account"} - ${s.project} - BL ${s.budget_line || "?"}`,
      `EUR ${money(s.total)}`,
    ]),
    notes: [`${files.length} receipt${files.length === 1 ? "" : "s"} attached, divided by budget line.`],
  };

  const hist: [string, string][] = [["Filed by", `${r.requester_name} on ${dt(r.created_at)}`]];
  if (!approvals.some((a) => a.signer_role === "PM")) {
    hist.push(["Superior", "No superior chosen: the RAC / CAR checks the report"]);
  }
  for (const a of approvals) {
    hist.push([
      a.signer_role === "RAC" ? "RAC / CAR" : "Superior",
      a.signed_at ? `Approved by ${a.user_name} on ${dt(a.signed_at)}` : `Waiting for ${a.user_name}`,
    ]);
  }
  // the accounting step (Callisto) is internal: the PDF only says whether the report is approved
  hist.push(["Status", r.status === "approved" || r.status === "registered" ? "Approved" : STATUS_LABEL[r.status]]);

  return { header, lines: sectionRows, summary, history: { title: "Approvals and history", rows: hist } };
}
