import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, money, type ExpenseApproval, type ExpenseReportRow } from "@/lib/domain/expenses";

type Item = Pick<
  ExpenseReportRow,
  "id" | "number" | "status" | "worker_name" | "subject" | "internal_code" | "total_eur" | "requester_name" | "created_at" | "callisto_protocol" | "paid_at"
>;

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ created?: string; filter?: string }> }) {
  const { created, filter } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myRoles } = await supabase.from("user_roles").select("role").eq("user_id", user?.id ?? "");
  const isAdministration = (myRoles ?? []).some((x) => ["ADMIN", "RAC", "CAR"].includes(x.role as string));
  const { data } = await supabase
    .from("expense_reports")
    .select("id, number, status, worker_name, subject, internal_code, total_eur, requester_name, created_at, callisto_protocol, paid_at")
    .order("created_at", { ascending: false });
  const all = (data ?? []) as Item[];
  const toImport = all.filter((r) => r.status === "approved");
  const rows = isAdministration && filter === "callisto" ? toImport : all;
  const { data: aps } = await supabase.from("expense_approvals").select("report_id, signer_role, signed_at");
  const approvals = (aps ?? []) as Pick<ExpenseApproval, "report_id" | "signer_role" | "signed_at">[];
  const missing = (id: string) =>
    approvals
      .filter((a) => a.report_id === id && !a.signed_at)
      .map((a) => (a.signer_role === "RAC" ? "RAC / CAR" : "Superior"))
      .join(", ");

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Expense reports</h1>
          <p className="subtitle">Reimbursement of expenses with receipts, approval and recording in Callisto (PR09).</p>
        </div>
        <div className="page-actions">
          <Link href="/expenses/new" className="primary">
            + New expense report
          </Link>
        </div>
      </div>

      {isAdministration && (
        <div className="banner" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {toImport.length > 0 ? (
            <>
              <span>
                <b>{toImport.length}</b> approved report{toImport.length === 1 ? "" : "s"} still to import in Callisto.
              </span>
              {filter === "callisto" ? <Link href="/expenses">Show all</Link> : <Link href="/expenses?filter=callisto">Show only these</Link>}
            </>
          ) : (
            <span>Nothing to import in Callisto: every approved report is flagged.</span>
          )}
        </div>
      )}

      {created && <div className="banner">Expense report {created} sent. The approvers have been notified by email.</div>}

      {rows.length === 0 ? (
        <p className="empty">No expense reports yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>No.</th>
                <th>Worker</th>
                <th>Object</th>
                <th>Project</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/expenses/${r.id}`}>{r.number}</Link>
                  </td>
                  <td>{r.worker_name}</td>
                  <td>{r.subject}</td>
                  <td>{r.internal_code}</td>
                  <td className="value" style={{ textAlign: "right" }}>
                    € {money(r.total_eur)}
                  </td>
                  <td>
                    <span className={`stamp ${r.status === "pending" || r.status === "approved" ? "warn" : r.status === "registered" ? "brand" : ""}`}>
                      {r.status === "approved" && isAdministration ? "To import in Callisto" : STATUS_LABEL[r.status]}
                    </span>
                    {r.status === "pending" && missing(r.id) ? (
                      <span style={{ fontSize: 11, color: "var(--ink-soft)", marginLeft: 6 }}>waiting: {missing(r.id)}</span>
                    ) : null}
                    {r.paid_at ? <span className="stamp brand" style={{ marginLeft: 6 }}>paid</span> : null}
                    {r.callisto_protocol ? <span style={{ fontSize: 11, marginLeft: 6 }}>· {r.callisto_protocol}</span> : null}
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
