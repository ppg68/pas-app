import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConfirmForm from "@/components/ConfirmForm";
import SubmitButton from "@/components/SubmitButton";
import ExpenseFiles from "@/components/expenses/ExpenseFiles";
import { expenseSections } from "@/lib/domain/expenseSections";
import {
  STATUS_LABEL,
  money,
  type ExpenseApproval,
  type ExpenseFileRow,
  type ExpenseLineRow,
  type ExpenseReportRow,
} from "@/lib/domain/expenses";
import {
  cancelExpenseReport,
  deleteExpenseReport,
  registerExpenseReport,
  sendExpenseReport,
  signExpenseReport,
} from "../actions";

const dt = (s: string | null) => (s ? new Date(s).toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "");

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <>
      {rows
        .filter(([, v]) => v)
        .map(([label, value], i) => (
          <div key={label + i} style={{ display: "flex", gap: 10, padding: "3px 0", fontSize: "0.88rem" }}>
            <span style={{ width: 210, flexShrink: 0, color: "var(--ink-soft)" }}>{label}</span>
            <span style={{ whiteSpace: "pre-wrap" }}>{value}</span>
          </div>
        ))}
    </>
  );
}

export default async function ExpenseDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; new?: string }>;
}) {
  const { id } = await params;
  const { error, new: isNew } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase.from("expense_reports").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as ExpenseReportRow;

  const [{ data: ls }, { data: aps }, { data: fs }, { data: myRoles }] = await Promise.all([
    supabase.from("expense_lines").select("*").eq("report_id", id).order("seq"),
    supabase.from("expense_approvals").select("*").eq("report_id", id),
    supabase.from("expense_files").select("*").eq("report_id", id).order("uploaded_at"),
    supabase.from("user_roles").select("role").eq("user_id", user?.id ?? ""),
  ]);
  const lines = (ls ?? []) as ExpenseLineRow[];
  const files = (fs ?? []) as ExpenseFileRow[];
  const approvals = ((aps ?? []) as ExpenseApproval[]).sort((a, b) => (a.signer_role === "PM" ? -1 : 1) - (b.signer_role === "PM" ? -1 : 1));
  const roles = (myRoles ?? []).map((x) => x.role as string);
  const isAdmin = roles.includes("ADMIN");
  const canRecord = roles.includes("CAR") || roles.includes("RAC") || isAdmin;
  const isOwner = r.requested_by === user?.id;
  const anySigned = approvals.some((a) => a.signed_at);
  const canEdit = isOwner && r.status === "pending" && !anySigned;

  let tripNumber: string | null = null;
  if (r.trip_id) {
    const { data: t } = await supabase.from("trip_requests").select("number").eq("id", r.trip_id).maybeSingle();
    tripNumber = t?.number ?? null;
  }
  const s = expenseSections(r, lines, approvals, files, tripNumber);
  const budgetLines = [...new Set(lines.map((l) => (l.budget_line ?? "").trim()).filter(Boolean))].sort();
  const hasFiles = files.length > 0;

  return (
    <div style={{ maxWidth: 860 }}>
      <p style={{ marginBottom: 6 }}>
        <Link href="/expenses">← Expense reports</Link>
      </p>
      <div className="page-header">
        <div>
          <h1>
            {r.number} · {r.worker_name}
          </h1>
          <p className="subtitle">
            {r.subject} · requested by {r.requester_name} on {dt(r.created_at)}
          </p>
        </div>
        <div className="page-actions">
          <span className={`stamp ${r.status === "pending" || r.status === "approved" ? "warn" : r.status === "registered" ? "brand" : ""}`}>
            {STATUS_LABEL[r.status]}
          </span>
          <a href={`/expenses/${id}/pdf`} className="ghost">
            PDF
          </a>
        </div>
      </div>

      {error && <div className="banner error">{error}</div>}
      {isNew && canEdit && (
        <div className="banner">
          Report saved. Attach the receipts below, divided by budget line, then press <b>Send to the approvers</b>.
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: "1rem", marginBottom: 8 }}>Approvals</h2>
        {!approvals.some((a) => a.signer_role === "PM") && (
          <p className="subtitle" style={{ margin: "0 0 6px" }}>
            Filed by the PM ({r.requester_name}): no separate PM approval is needed.
          </p>
        )}
        {approvals.map((a) => (
          <div key={a.signer_role} style={{ display: "flex", gap: 12, alignItems: "center", padding: "4px 0" }}>
            <b style={{ width: 90 }}>{a.signer_role === "RAC" ? "RAC / CAR" : "PM"}</b>
            <span style={{ flex: 1 }}>{a.user_name}</span>
            {a.signed_at ? (
              <span className="stamp brand">approved {dt(a.signed_at)}</span>
            ) : r.status === "pending" && a.user_id === user?.id && hasFiles ? (
              <form action={signExpenseReport.bind(null, id, a.signer_role)}>
                <SubmitButton pendingLabel="Approving…">Approve</SubmitButton>
              </form>
            ) : (
              <span className="stamp">waiting</span>
            )}
          </div>
        ))}
        <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "4px 0" }}>
          <b style={{ width: 90 }}>Callisto</b>
          <span style={{ flex: 1 }}>{r.registered_by_name ?? ""}</span>
          {r.registered_at ? (
            <span className="stamp brand">
              recorded {dt(r.registered_at)} · {r.callisto_protocol}
            </span>
          ) : (
            <span className="stamp">{r.status === "approved" ? "to do" : "after approval"}</span>
          )}
        </div>
        {canEdit && (
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <form action={sendExpenseReport.bind(null, id)}>
              <SubmitButton pendingLabel="Sending…">Send to the approvers</SubmitButton>
            </form>
            <Link href={`/expenses/${id}/edit`} className="ghost">
              Edit report
            </Link>
          </div>
        )}
        {(canEdit || (isOwner && r.status === "pending") || isAdmin) && (
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            {(canEdit || isAdmin) && (
              <ConfirmForm
                action={deleteExpenseReport.bind(null, id)}
                message={anySigned ? "This report has been signed. Delete it for good?" : "Delete this report?"}
              >
                <button type="submit" className="ghost danger">
                  Delete
                </button>
              </ConfirmForm>
            )}
            {!canEdit && isOwner && r.status === "pending" && (
              <ConfirmForm action={cancelExpenseReport.bind(null, id)} message="Cancel this report?">
                <button type="submit" className="ghost danger">
                  Cancel report
                </button>
              </ConfirmForm>
            )}
          </div>
        )}
        {r.status === "pending" && !hasFiles && (
          <p className="subtitle" style={{ margin: "8px 0 0" }}>
            Approvals open once at least one receipt is attached.
          </p>
        )}
      </div>

      {r.status === "approved" && canRecord && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: "1rem", marginBottom: 8 }}>Record in Callisto</h2>
          <p className="subtitle" style={{ margin: "0 0 10px" }}>
            Use the summary below (account, project, budget line). Then enter the accounting protocol: the report is closed.
          </p>
          <form action={registerExpenseReport.bind(null, id)} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="field" style={{ maxWidth: 260 }}>
              <label>Accounting protocol *</label>
              <input name="callisto_protocol" required />
            </div>
            <div className="field">
              <label>Note (optional)</label>
              <input name="registration_note" />
            </div>
            <SubmitButton style={{ width: "fit-content" }} pendingLabel="Saving…">
              Record and close
            </SubmitButton>
          </form>
        </div>
      )}
      {r.status === "approved" && !canRecord && (
        <p className="subtitle">The report is approved. The administration will record it in Callisto.</p>
      )}

      <ExpenseFiles
        reportId={id}
        files={files}
        budgetLines={budgetLines}
        canAdd={isOwner && (r.status === "pending" || r.status === "approved")}
        canRemove={(isOwner && canEdit) || isAdmin}
      />

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: "1rem", marginBottom: 8 }}>{s.header.title}</h2>
        <Rows rows={s.header.rows ?? []} />
      </div>

      {s.lines.map((sec) => (
        <div key={sec.title} className="card" style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: "1rem", marginBottom: 8 }}>{sec.title}</h2>
          <Rows rows={sec.rows ?? []} />
        </div>
      ))}

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: "1rem", marginBottom: 8 }}>{s.summary.title}</h2>
        <Rows rows={s.summary.rows ?? []} />
        <div style={{ borderTop: "1px solid var(--line)", marginTop: 6, paddingTop: 6 }}>
          <b>TOTAL: € {money(r.total_eur)}</b>
        </div>
      </div>
    </div>
  );
}
