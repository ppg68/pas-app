import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { KIND_LABEL, STATUS_LABEL, type ContractApproval, type ContractRequestRow } from "@/lib/domain/contractRequests";

export default async function ContractRequestsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contract_requests")
    .select("id, number, kind, status, party_name, requester_name, amount, currency, start_date, end_date, created_at, contract_id")
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as Pick<
    ContractRequestRow,
    "id" | "number" | "kind" | "status" | "party_name" | "requester_name" | "amount" | "currency" | "start_date" | "end_date" | "created_at" | "contract_id"
  >[];

  const { data: aps } = await supabase.from("contract_approvals").select("request_id, signer_role, signed_at");
  const approvals = (aps ?? []) as Pick<ContractApproval, "request_id" | "signer_role" | "signed_at">[];
  const missing = (id: string) =>
    approvals
      .filter((a) => a.request_id === id && !a.signed_at)
      .map((a) => a.signer_role)
      .join(", ");

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Contract requests</h1>
          <p className="subtitle">Request to activate a contract with a consultant or a company (PR09 form, online).</p>
        </div>
        <div className="page-actions">
          <Link href="/contract-requests/new" className="button primary">
            + New request
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="empty">No contract requests yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>No.</th>
                <th>Party</th>
                <th>Type</th>
                <th>Period</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>Requested by</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/contract-requests/${r.id}`}>{r.number}</Link>
                  </td>
                  <td>{r.party_name}</td>
                  <td>{KIND_LABEL[r.kind]}</td>
                  <td>
                    {r.start_date ?? "from signature"} → {r.end_date ?? ""}
                  </td>
                  <td className="value" style={{ textAlign: "right" }}>
                    {r.amount.toLocaleString("it-IT", { minimumFractionDigits: 2 })} {r.currency}
                  </td>
                  <td>{r.requester_name}</td>
                  <td>
                    <span className={`stamp ${r.status === "pending" ? "warn" : r.status === "approved" ? "brand" : ""}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                    {r.status === "pending" && missing(r.id) ? (
                      <span style={{ fontSize: 11, color: "var(--ink-soft)", marginLeft: 6 }}>waiting: {missing(r.id)}</span>
                    ) : null}
                    {r.contract_id ? <span style={{ fontSize: 11, marginLeft: 6 }}>· in register</span> : null}
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
