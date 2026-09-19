import { createClient } from "@/lib/supabase/server";
import {
  CONTRACT_STATUS_LABEL,
  CONTRACT_KIND_SUGGESTIONS,
  totalPaid,
  totalScheduled,
  daysUntil,
  formatDateIT,
  formatMoney,
} from "@/lib/domain/contracts";
import {
  updateContract,
  deleteContract,
  toggleComplianceField,
  addTranche,
  deleteTranche,
  toggleTranchePaid,
} from "../actions";

const cardStyle: React.CSSProperties = {
  border: "0.5px solid #d3d1c7",
  borderRadius: 10,
  padding: 16,
  marginBottom: 16,
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "0.5px solid #d3d1c7",
  borderRadius: 6,
  padding: "7px 9px",
  fontSize: 13,
};
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#5f5e5a",
  marginBottom: 4,
};
const buttonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 6,
  padding: "7px 12px",
  fontSize: 13,
  fontWeight: 500,
  background: "#1A3A5C",
  color: "#fff",
  cursor: "pointer",
};
const ghostButtonStyle: React.CSSProperties = {
  border: "0.5px solid #b4b2a9",
  borderRadius: 999,
  padding: "3px 10px",
  fontSize: 11,
  background: "transparent",
  cursor: "pointer",
};
const row2: React.CSSProperties = { display: "flex", gap: 8 };

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
    return <div style={{ padding: 24, fontSize: 13 }}>Contract not found.</div>;
  }

  const paid = totalPaid(tranches ?? []);
  const scheduled = totalScheduled(tranches ?? []);
  const balance = contract.amount - paid;
  const dLeft = daysUntil(contract.end_date);
  const overdue = dLeft !== null && dLeft < 0 && contract.status === "in_corso";

  return (
    <div style={{ maxWidth: 700, padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>{contract.subject}</h1>
        <div style={{ fontSize: 13, color: "#5f5e5a" }}>
          {[contract.country, contract.project_code].filter(Boolean).join(" · ")}
          {(contract.country || contract.project_code) && " · "}
          {formatMoney(contract.amount)} {contract.currency}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <span style={{ ...ghostButtonStyle, cursor: "default" }}>
            {CONTRACT_STATUS_LABEL[contract.status]}
          </span>
          {contract.end_date && (
            <span
              style={{
                ...ghostButtonStyle,
                cursor: "default",
                borderColor: overdue ? "#c0392b" : "#b4b2a9",
                color: overdue ? "#c0392b" : "inherit",
              }}
            >
              ends {formatDateIT(contract.end_date)}
              {overdue && ` · overdue (${Math.abs(dLeft!)}d)`}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            background: "#faeeda",
            color: "#633806",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {decodeURIComponent(error)}
        </div>
      )}

      {/* Payment summary */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>Payments</h2>
        <div style={{ display: "flex", gap: 20, fontSize: 13, marginBottom: 12 }}>
          <div>
            <div style={{ color: "#888780", fontSize: 11 }}>Contract amount</div>
            <div style={{ fontWeight: 500 }}>
              {formatMoney(contract.amount)} {contract.currency}
            </div>
          </div>
          <div>
            <div style={{ color: "#888780", fontSize: 11 }}>Scheduled (tranches)</div>
            <div style={{ fontWeight: 500 }}>
              {formatMoney(scheduled)} {contract.currency}
            </div>
          </div>
          <div>
            <div style={{ color: "#888780", fontSize: 11 }}>Paid</div>
            <div style={{ fontWeight: 500 }}>
              {formatMoney(paid)} {contract.currency}
            </div>
          </div>
          <div>
            <div style={{ color: "#888780", fontSize: 11 }}>Balance</div>
            <div style={{ fontWeight: 500 }}>
              {formatMoney(balance)} {contract.currency}
            </div>
          </div>
        </div>

        {(tranches ?? []).length === 0 && (
          <p style={{ fontSize: 13, color: "#888780", marginBottom: 10 }}>No tranches yet.</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {(tranches ?? []).map((t) => (
            <div
              key={t.id}
              style={{
                border: "0.5px solid #e4e2da",
                borderRadius: 8,
                padding: "8px 10px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 13,
                gap: 8,
              }}
            >
              <div>
                <div>
                  #{t.seq} {t.label ? `— ${t.label}` : ""}
                </div>
                <div style={{ color: "#888780", fontSize: 12 }}>
                  {formatMoney(t.amount)} {contract.currency}
                  {t.due_date ? ` · due ${formatDateIT(t.due_date)}` : ""}
                  {t.due_condition ? ` · ${t.due_condition}` : ""}
                  {t.paid && t.paid_date ? ` · paid ${formatDateIT(t.paid_date)}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                <form action={toggleTranchePaid.bind(null, contract.id, t.id, !t.paid)}>
                  <button type="submit" style={ghostButtonStyle}>
                    {t.paid ? "Mark unpaid" : "Mark paid"}
                  </button>
                </form>
                <form action={deleteTranche.bind(null, contract.id, t.id)}>
                  <button type="submit" style={{ ...ghostButtonStyle, color: "#c0392b" }}>
                    Remove
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>

        <form
          action={addTranche.bind(null, contract.id)}
          style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}
        >
          <div style={{ flex: "1 1 140px" }}>
            <label style={labelStyle}>Label</label>
            <input name="label" placeholder="e.g. upon signature" style={inputStyle} />
          </div>
          <div style={{ width: 120 }}>
            <label style={labelStyle}>Amount</label>
            <input name="amount" type="number" step="0.01" min="0.01" required style={inputStyle} />
          </div>
          <div style={{ width: 150 }}>
            <label style={labelStyle}>Due date</label>
            <input name="due_date" type="date" style={inputStyle} />
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label style={labelStyle}>Due condition (if not a fixed date)</label>
            <input name="due_condition" placeholder="e.g. upon final report" style={inputStyle} />
          </div>
          <button type="submit" style={buttonStyle}>
            Add tranche
          </button>
        </form>
      </div>

      {/* Compliance checklist */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>Compliance</h2>
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
              }}
            >
              <span>
                {label} — {checked ? "done" : "pending"}
              </span>
              <form action={toggleComplianceField.bind(null, contract.id, key, !checked)}>
                <button type="submit" style={ghostButtonStyle}>
                  {checked ? "Undo" : "Mark done"}
                </button>
              </form>
            </div>
          );
        })}
      </div>

      {/* Contract details (editable) */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>Details</h2>
        <form
          action={updateContract.bind(null, contract.id)}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div>
            <label style={labelStyle}>Subject (Soggetto)</label>
            <input name="subject" defaultValue={contract.subject} required style={inputStyle} />
          </div>

          <div style={row2}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Status</label>
              <select name="status" defaultValue={contract.status} style={inputStyle}>
                <option value="in_corso">In corso</option>
                <option value="concluso">Concluso</option>
                <option value="annullato">Annullato</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Contract type</label>
              <input
                name="contract_kind"
                list="contract-kind-options"
                defaultValue={contract.contract_kind ?? ""}
                style={inputStyle}
              />
              <datalist id="contract-kind-options">
                {CONTRACT_KIND_SUGGESTIONS.map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>
            </div>
          </div>

          <div style={row2}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Typology</label>
              <input name="typology" defaultValue={contract.typology ?? ""} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Unit</label>
              <input name="unit" defaultValue={contract.unit ?? ""} style={inputStyle} />
            </div>
          </div>

          <div style={row2}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Role</label>
              <input name="role_title" defaultValue={contract.role_title ?? ""} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Activity</label>
              <input name="activity" defaultValue={contract.activity ?? ""} style={inputStyle} />
            </div>
          </div>

          <div style={row2}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Country</label>
              <input name="country" defaultValue={contract.country ?? ""} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Project</label>
              <input name="project_code" defaultValue={contract.project_code ?? ""} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>IR</label>
              <input name="ir_code" defaultValue={contract.ir_code ?? ""} style={inputStyle} />
            </div>
          </div>

          <div style={row2}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Signed date</label>
              <input name="signed_date" type="date" defaultValue={contract.signed_date ?? ""} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Start</label>
              <input name="start_date" type="date" defaultValue={contract.start_date ?? ""} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>End</label>
              <input name="end_date" type="date" defaultValue={contract.end_date ?? ""} style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Project deadline</label>
            <input
              name="project_deadline"
              type="date"
              defaultValue={contract.project_deadline ?? ""}
              style={inputStyle}
            />
          </div>

          <div style={row2}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Amount, VAT included</label>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                defaultValue={contract.amount}
                required
                style={inputStyle}
              />
            </div>
            <div style={{ width: 90 }}>
              <label style={labelStyle}>Currency</label>
              <input name="currency" defaultValue={contract.currency} style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Payment terms (free text)</label>
            <textarea
              name="payment_terms"
              rows={3}
              defaultValue={contract.payment_terms ?? ""}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          <div>
            <label style={labelStyle}>Referent</label>
            <input name="referent" defaultValue={contract.referent ?? ""} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              name="notes"
              rows={2}
              defaultValue={contract.notes ?? ""}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          <button type="submit" style={{ ...buttonStyle, marginTop: 8, width: "fit-content" }}>
            Save changes
          </button>
        </form>
      </div>

      <form action={deleteContract.bind(null, contract.id)}>
        <button
          type="submit"
          style={{
            border: "0.5px solid #c0392b",
            borderRadius: 6,
            padding: "7px 12px",
            fontSize: 13,
            background: "transparent",
            color: "#c0392b",
            cursor: "pointer",
          }}
        >
          Delete contract
        </button>
      </form>
    </div>
  );
}
