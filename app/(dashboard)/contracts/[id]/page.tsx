import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  CONTRACT_STATUS_LABEL,
  totalPaid,
  totalScheduled,
  daysUntil,
  formatDateIT,
  formatMoney,
} from "@/lib/domain/contracts";
import {
  deleteContract,
  toggleComplianceField,
  addTranche,
  deleteTranche,
  toggleTranchePaid,
  createInvoice,
  deleteInvoice,
} from "../actions";

const rowForm: React.CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" };
const lineItem: React.CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "8px 10px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: 13,
  gap: 8,
  marginBottom: 8,
};

const COMPLIANCE_FIELDS = [
  { key: "signed", label: "Firmato" },
  { key: "privacy", label: "Privacy" },
  { key: "code_of_conduct", label: "Codice di Condotta" },
  { key: "psea_policy", label: "PSEA Policy" },
  { key: "criminal_record_check", label: "Casellario Giudiziale / autocert." },
  { key: "technical_requirements_check", label: "Autocert. requisiti tecnico professionali" },
  { key: "labor_inspectorate_notice", label: "Comunicazione ispettorato del lavoro" },
] as const;

export default async function ContractDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const [{ data: contract }, { data: tranches }] = await Promise.all([
    supabase.from("contracts").select("*").eq("id", id).single(),
    supabase
      .from("contract_tranches")
      .select("*")
      .eq("contract_id", id)
      .order("seq", { ascending: true }),
  ]);

  if (!contract) {
    return <div style={{ fontSize: 13 }}>Contract not found.</div>;
  }

  const { data: invoices } = await supabase
    .from("contract_invoices")
    .select("*")
    .eq("contract_id", id)
    .order("invoice_date", { ascending: false, nullsFirst: false });

  const paid = totalPaid(tranches ?? []);
  const scheduled = totalScheduled(tranches ?? []);
  const balance = contract.amount - paid;
  const dLeft = daysUntil(contract.end_date);
  const overdue = dLeft !== null && dLeft < 0 && contract.status === "in_corso";

  return (
    <div style={{ maxWidth: 760 }}>
      <Link href="/contracts" style={{ fontSize: 13, color: "var(--ink-soft)" }}>
        ← Back to Contracts
      </Link>

      <div style={{ margin: "10px 0 20px" }}>
        <h1 style={{ marginBottom: 4 }}>{contract.subject}</h1>
        <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          {[contract.country, contract.project_code].filter(Boolean).join(" · ")}
          {(contract.country || contract.project_code) && " · "}
          {formatMoney(contract.amount)} {contract.currency}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <span className="stamp brand">{CONTRACT_STATUS_LABEL[contract.status]}</span>
          {contract.end_date && (
            <span className={overdue ? "stamp warn" : "stamp"}>
              ends {formatDateIT(contract.end_date)}
              {overdue && ` · overdue (${Math.abs(dLeft!)}d)`}
            </span>
          )}
        </div>
      </div>

      {error && <div className="banner error">{decodeURIComponent(error)}</div>}

      {/* Payment summary */}
      <div className="card">
        <h2 style={{ fontSize: 14, marginBottom: 10 }}>Payments</h2>
        <div style={{ display: "flex", gap: 22, fontSize: 13, marginBottom: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "var(--ink-soft)", fontSize: 11 }}>Contract amount</div>
            <div className="value" style={{ fontWeight: 600 }}>
              {formatMoney(contract.amount)} {contract.currency}
            </div>
          </div>
          <div>
            <div style={{ color: "var(--ink-soft)", fontSize: 11 }}>Scheduled (tranches)</div>
            <div className="value" style={{ fontWeight: 600 }}>
              {formatMoney(scheduled)} {contract.currency}
            </div>
          </div>
          <div>
            <div style={{ color: "var(--ink-soft)", fontSize: 11 }}>Paid</div>
            <div className="value" style={{ fontWeight: 600 }}>
              {formatMoney(paid)} {contract.currency}
            </div>
          </div>
          <div>
            <div style={{ color: "var(--ink-soft)", fontSize: 11 }}>Balance</div>
            <div className="value" style={{ fontWeight: 600 }}>
              {formatMoney(balance)} {contract.currency}
            </div>
          </div>
        </div>

        {(tranches ?? []).length === 0 && <p className="empty">No tranches yet.</p>}

        <div style={{ marginBottom: 4 }}>
          {(tranches ?? []).map((t) => (
            <div key={t.id} style={lineItem}>
              <div>
                <div>
                  #{t.seq} {t.label ? `— ${t.label}` : ""}
                </div>
                <div style={{ color: "var(--ink-soft)", fontSize: 12 }}>
                  {formatMoney(t.amount)} {contract.currency}
                  {t.due_date ? ` · due ${formatDateIT(t.due_date)}` : ""}
                  {t.due_condition ? ` · ${t.due_condition}` : ""}
                  {t.paid && t.paid_date ? ` · paid ${formatDateIT(t.paid_date)}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <form action={toggleTranchePaid.bind(null, contract.id, t.id, !t.paid)}>
                  <button type="submit" className="pill">
                    {t.paid ? "Mark unpaid" : "Mark paid"}
                  </button>
                </form>
                <form action={deleteTranche.bind(null, contract.id, t.id)}>
                  <button type="submit" className="pill" style={{ color: "var(--brick)" }}>
                    Remove
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>

        <form action={addTranche.bind(null, contract.id)} style={{ ...rowForm, marginTop: 8 }}>
          <div className="field" style={{ flex: "1 1 140px" }}>
            <label>Label</label>
            <input name="label" placeholder="e.g. upon signature" />
          </div>
          <div className="field" style={{ width: 120 }}>
            <label>Amount</label>
            <input name="amount" type="number" step="0.01" min="0.01" required />
          </div>
          <div className="field" style={{ width: 150 }}>
            <label>Due date</label>
            <input name="due_date" type="date" />
          </div>
          <div className="field" style={{ flex: "1 1 160px" }}>
            <label>Due condition (if not a fixed date)</label>
            <input name="due_condition" placeholder="e.g. upon final report" />
          </div>
          <button type="submit" className="primary">
            Add tranche
          </button>
        </form>
      </div>

      {/* Invoices ("Elenco Fatture") — Elisa's actual recorded invoices; their
          totals are what "importo pagato" really is, separate from the
          planned tranches above. */}
      <div className="card">
        <h2 style={{ fontSize: 14, marginBottom: 10 }}>Invoices</h2>

        {(invoices ?? []).length === 0 && <p className="empty">No invoices yet.</p>}

        <div style={{ marginBottom: 4 }}>
          {(invoices ?? []).map((inv) => (
            <div key={inv.id} style={lineItem}>
              <div>
                <div>
                  {inv.invoice_number ? `#${inv.invoice_number}` : "Invoice"}
                  {inv.protocol ? ` · prot. ${inv.protocol}` : ""}
                </div>
                <div style={{ color: "var(--ink-soft)", fontSize: 12 }}>
                  {formatMoney(inv.amount)} {contract.currency}
                  {inv.invoice_date ? ` · ${formatDateIT(inv.invoice_date)}` : ""}
                  {inv.description ? ` · ${inv.description}` : ""}
                  {inv.paid_amount != null
                    ? ` · paid ${formatMoney(inv.paid_amount)}${inv.payment_date ? ` (${formatDateIT(inv.payment_date)})` : ""}${inv.payment_note ? ` — ${inv.payment_note}` : ""}`
                    : ""}
                </div>
              </div>
              <form action={deleteInvoice.bind(null, inv.id)}>
                <button type="submit" className="pill" style={{ color: "var(--brick)" }}>
                  Remove
                </button>
              </form>
            </div>
          ))}
        </div>

        <form
          action={createInvoice.bind(null, contract.id, contract.legacy_id ?? "")}
          style={{ ...rowForm, marginTop: 8 }}
        >
          <div className="field" style={{ width: 110 }}>
            <label>Invoice #</label>
            <input name="invoice_number" />
          </div>
          <div className="field" style={{ width: 140 }}>
            <label>Invoice date</label>
            <input name="invoice_date" type="date" />
          </div>
          <div className="field" style={{ width: 120 }}>
            <label>Amount</label>
            <input name="amount" type="number" step="0.01" min="0" required />
          </div>
          <div className="field" style={{ width: 100 }}>
            <label>Protocol</label>
            <input name="protocol" />
          </div>
          <div className="field" style={{ flex: "1 1 160px" }}>
            <label>Description</label>
            <input name="description" />
          </div>
          <div className="field" style={{ width: 120 }}>
            <label>Paid amount</label>
            <input name="paid_amount" type="number" step="0.01" />
          </div>
          <div className="field" style={{ width: 140 }}>
            <label>Payment date</label>
            <input name="payment_date" type="date" />
          </div>
          <button type="submit" className="primary">
            Add invoice
          </button>
        </form>
      </div>

      {/* Compliance checklist */}
      <div className="card">
        <h2 style={{ fontSize: 14, marginBottom: 10 }}>Compliance</h2>
        {COMPLIANCE_FIELDS.map(({ key, label }) => {
          const checked = Boolean(contract[key as keyof typeof contract]);
          return (
            <div
              key={key}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 13,
                padding: "6px 0",
                borderBottom: "0.5px solid #EEF0F3",
              }}
            >
              <span>
                {label} — {checked ? "done" : "pending"}
              </span>
              <form action={toggleComplianceField.bind(null, contract.id, key, !checked)}>
                <button type="submit" className="pill">
                  {checked ? "Undo" : "Mark done"}
                </button>
              </form>
            </div>
          );
        })}
      </div>

      <p className="subtitle" style={{ marginBottom: 8 }}>
        Every other field (subject, dates, amount, project, referent, notes…) can be edited
        directly from the Contracts table — click any cell there.
      </p>

      <form action={deleteContract.bind(null, contract.id)}>
        <button type="submit" className="ghost danger">
          Delete contract
        </button>
      </form>
    </div>
  );
}
