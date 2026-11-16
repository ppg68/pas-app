import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { SECTION_BY_KEY, type ExpenseLineRow, type ExpenseReportRow } from "@/lib/domain/expenses";

export const dynamic = "force-dynamic";

const MAX_DESC = 50;

/**
 * Excel to import the report costs in Callisto (same layout as the payroll / expense import):
 * A date, B account, C debit, D credit, E description, F project, G budget line.
 * One debit row per expense row (account 11.10.0x, project, budget line) and one credit at the bottom, for the
 * total, on the account of the person who filed the report. Invoices addressed to Oikos are left out (debt to the supplier, not to the person).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not authenticated", { status: 401 });

  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  if (!(roles ?? []).some((x) => ["ADMIN", "RAC", "CAR"].includes(x.role as string))) {
    return new Response("Only the administration can export for Callisto", { status: 403 });
  }

  const { data } = await supabase.from("expense_reports").select("*").eq("id", id).maybeSingle();
  if (!data) return new Response("Expense report not found", { status: 404 });
  const r = data as ExpenseReportRow;
  if (r.status !== "approved" && r.status !== "registered") return new Response("The report is not approved yet", { status: 409 });

  const [{ data: ls }, { data: prof }] = await Promise.all([
    supabase.from("expense_lines").select("*").eq("report_id", id).order("seq"),
    supabase.from("profiles").select("callisto_account").eq("id", r.worker_id ?? r.requested_by).maybeSingle(),
  ]);
  const account = (prof?.callisto_account ?? "").trim();
  if (!account) {
    return new Response(`No Callisto account for ${r.worker_id ? r.worker_name : r.requester_name}: ADMIN can enter it in Settings > Team.`, { status: 409 });
  }

  const lines = ((ls ?? []) as ExpenseLineRow[]).filter((l) => l.section !== "invoices");
  const surname = (r.worker_id ? r.worker_name : r.requester_name).trim().split(/\s+/).slice(-1)[0] ?? "";
  const rows: (string | number | Date | null)[][] = [];
  for (const l of lines) {
    const date = l.line_date ? new Date(`${l.line_date}T00:00:00Z`) : null;
    const motive = [l.motive, l.location].map((x) => (x ?? "").trim()).filter(Boolean)[0] ?? "";
    const desc = `nota spese ${surname} ${r.number} ${motive}`.trim().slice(0, MAX_DESC).trim();
    rows.push([date, SECTION_BY_KEY[l.section].account, l.amount_eur, null, desc, r.internal_code, l.budget_line]);
  }
  // one credit for the whole report, at the bottom, on the account of the person who filed it
  const total = Math.round(lines.reduce((t, l) => t + l.amount_eur, 0) * 100) / 100;
  const lastDate = lines.map((l) => l.line_date).filter(Boolean).sort().pop();
  rows.push([
    lastDate ? new Date(`${lastDate}T00:00:00Z`) : null,
    account,
    null,
    total,
    `nota spese ${surname} ${r.number}`.slice(0, MAX_DESC),
    null,
    null,
  ]);
  if (rows.length === 0) return new Response("No expense rows to export (invoices addressed to Oikos are excluded)", { status: 409 });

  const ws = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
  rows.forEach((_, i) => {
    const c = ws[`A${i + 1}`];
    if (c && c.t === "d") c.z = "dd/mm/yyyy";
  });
  ws["!cols"] = [{ wch: 11 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 50 }, { wch: 10 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Foglio1");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Callisto_${r.number}.xlsx"`,
    },
  });
}
