import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ADVANCE_INVOICE_DAYS, ADVANCE_REASONS, advanceDueDate, isAdvanceOverdue } from "@/lib/domain/advances";

const money = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d: Date) => d.toLocaleDateString("it-IT");

/** Open advance payments: authorized (or being authorized) before the invoice exists. */
export default async function AdvancesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payment_authorizations")
    .select("id, request_id, beneficiary, description, amount, currency, status, advance_reason, advance_reason_other, prepared_by, authorized_at, created_at")
    .eq("is_advance", true)
    .is("invoice_id", null)
    .order("created_at", { ascending: true });
  const rows = data ?? [];

  const reqIds = Array.from(new Set(rows.map((r) => r.request_id)));
  const prepIds = Array.from(new Set(rows.map((r) => r.prepared_by).filter((v): v is string => !!v)));
  const [{ data: reqs }, { data: profs }] = await Promise.all([
    reqIds.length
      ? supabase.from("requests").select("id, code, project_code").in("id", reqIds)
      : Promise.resolve({ data: [] as { id: string; code: string; project_code: string }[] }),
    prepIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", prepIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);
  const reqOf = (id: string) => (reqs ?? []).find((r) => r.id === id);
  const nameOf = (id: string | null) => (profs ?? []).find((p) => p.id === id)?.full_name ?? "—";

  const items = rows
    .map((r) => ({ ...r, due: advanceDueDate(r), overdue: isAdvanceOverdue(r) }))
    .sort((a, b) => a.due.getTime() - b.due.getTime());
  const overdue = items.filter((i) => i.overdue).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Advances</h1>
          <p className="subtitle">
            Payments authorized before the invoice: the invoice must be linked within {ADVANCE_INVOICE_DAYS} days of the authorization.
            {overdue > 0 ? ` ${overdue} overdue.` : ""}
          </p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="empty">No advance payment waiting for an invoice.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>IR</th>
                <th>Project</th>
                <th>Beneficiary</th>
                <th>Reason</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>Prepared by</th>
                <th>Invoice due by</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link href={`/requests/${i.request_id}`}>{reqOf(i.request_id)?.code ?? "—"}</Link>
                  </td>
                  <td>{reqOf(i.request_id)?.project_code ?? "—"}</td>
                  <td>{i.beneficiary}</td>
                  <td>
                    {ADVANCE_REASONS[i.advance_reason ?? ""] ?? "—"}
                    {i.advance_reason === "other" && i.advance_reason_other ? `: ${i.advance_reason_other}` : ""}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {money(i.amount)} {i.currency}
                  </td>
                  <td>{nameOf(i.prepared_by)}</td>
                  <td>{day(i.due)}</td>
                  <td>
                    <span className={`stamp ${i.overdue ? "" : "warn"}`}>
                      {i.overdue ? "Overdue" : i.status === "pending" ? "To be authorized" : "Invoice awaited"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
