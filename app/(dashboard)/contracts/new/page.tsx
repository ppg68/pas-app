import { createContract } from "../actions";
import { CONTRACT_KIND_SUGGESTIONS } from "@/lib/domain/contracts";

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "0.5px solid #d3d1c7",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 14,
};
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#5f5e5a",
  marginBottom: 4,
};
const row2: React.CSSProperties = { display: "flex", gap: 8 };

export default async function NewContractPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div style={{ maxWidth: 560, padding: 24 }}>
      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 16 }}>New contract</h1>

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

      <form action={createContract} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={labelStyle}>Subject (Soggetto)</label>
          <input name="subject" required style={inputStyle} />
        </div>

        <div style={row2}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Status</label>
            <select name="status" defaultValue="in_corso" style={inputStyle}>
              <option value="in_corso">In corso</option>
              <option value="concluso">Concluso</option>
              <option value="annullato">Annullato</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Contract type</label>
            <input name="contract_kind" list="contract-kind-options" style={inputStyle} />
            <datalist id="contract-kind-options">
              {CONTRACT_KIND_SUGGESTIONS.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          </div>
        </div>

        <div style={row2}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Typology (Tipologia)</label>
            <input name="typology" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Unit (Unità)</label>
            <input name="unit" style={inputStyle} />
          </div>
        </div>

        <div style={row2}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Role (Ruolo)</label>
            <input name="role_title" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Activity (Attività)</label>
            <input name="activity" style={inputStyle} />
          </div>
        </div>

        <div style={row2}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Country (Paese)</label>
            <input name="country" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Project (Progetto)</label>
            <input name="project_code" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>IR</label>
            <input name="ir_code" style={inputStyle} />
          </div>
        </div>

        <div style={row2}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Signed date</label>
            <input name="signed_date" type="date" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Start (Inizio)</label>
            <input name="start_date" type="date" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>End (Fine)</label>
            <input name="end_date" type="date" style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Project deadline (Scadenza progetto)</label>
          <input name="project_deadline" type="date" style={inputStyle} />
        </div>

        <div style={row2}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Amount, VAT included (importo contratto)</label>
            <input name="amount" type="number" step="0.01" min="0" required style={inputStyle} />
          </div>
          <div style={{ width: 90 }}>
            <label style={labelStyle}>Currency</label>
            <input name="currency" defaultValue="EUR" style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Payment terms (condizioni di pagamento, free text)</label>
          <textarea name="payment_terms" rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          <p style={{ fontSize: 11, color: "#888780", marginTop: 4 }}>
            Structured tranches can be added once the contract is created.
          </p>
        </div>

        <div>
          <label style={labelStyle}>Referent (REFERENTE)</label>
          <input name="referent" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Notes</label>
          <textarea name="notes" rows={2} style={{ ...inputStyle, resize: "vertical" }} />
        </div>

        <button
          type="submit"
          style={{
            border: 0,
            borderRadius: 6,
            padding: "9px 14px",
            fontSize: 14,
            fontWeight: 500,
            background: "#1A3A5C",
            color: "#fff",
            cursor: "pointer",
            marginTop: 8,
          }}
        >
          Create contract
        </button>
      </form>
    </div>
  );
}
