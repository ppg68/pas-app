import { createContract } from "../actions";
import { CONTRACT_KIND_SUGGESTIONS } from "@/lib/domain/contracts";

const row: React.CSSProperties = { display: "flex", gap: 12 };

export default async function NewContractPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div style={{ maxWidth: 620 }}>
      <h1 style={{ marginBottom: 16 }}>New contract</h1>

      {error && <div className="banner error">{decodeURIComponent(error)}</div>}

      <form action={createContract} className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="field">
          <label>Subject (Soggetto)</label>
          <input name="subject" required />
        </div>

        <div style={row}>
          <div className="field" style={{ flex: 1 }}>
            <label>Status</label>
            <select name="status" defaultValue="in_corso">
              <option value="in_corso">In corso</option>
              <option value="concluso">Concluso</option>
              <option value="annullato">Annullato</option>
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Contract type</label>
            <input name="contract_kind" list="contract-kind-options" />
            <datalist id="contract-kind-options">
              {CONTRACT_KIND_SUGGESTIONS.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          </div>
        </div>

        <div style={row}>
          <div className="field" style={{ flex: 1 }}>
            <label>Typology (Tipologia)</label>
            <input name="typology" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Unit (Unità)</label>
            <input name="unit" />
          </div>
        </div>

        <div style={row}>
          <div className="field" style={{ flex: 1 }}>
            <label>Role (Ruolo)</label>
            <input name="role_title" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Activity (Attività)</label>
            <input name="activity" />
          </div>
        </div>

        <div style={row}>
          <div className="field" style={{ flex: 1 }}>
            <label>Country (Paese)</label>
            <input name="country" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Project (Progetto)</label>
            <input name="project_code" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>IR</label>
            <input name="ir_code" />
          </div>
        </div>

        <div style={row}>
          <div className="field" style={{ flex: 1 }}>
            <label>Signed date</label>
            <input name="signed_date" type="date" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Start (Inizio)</label>
            <input name="start_date" type="date" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>End (Fine)</label>
            <input name="end_date" type="date" />
          </div>
        </div>

        <div className="field">
          <label>Project deadline (Scadenza progetto)</label>
          <input name="project_deadline" type="date" />
        </div>

        <div style={row}>
          <div className="field" style={{ flex: 1 }}>
            <label>Amount, VAT included (importo contratto)</label>
            <input name="amount" type="number" step="0.01" min="0" required />
          </div>
          <div className="field" style={{ width: 90 }}>
            <label>Currency</label>
            <input name="currency" defaultValue="EUR" />
          </div>
        </div>

        <div className="field">
          <label>Payment terms (condizioni di pagamento, free text)</label>
          <textarea name="payment_terms" rows={3} style={{ resize: "vertical" }} />
          <p style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>
            Structured tranches can be added once the contract is created.
          </p>
        </div>

        <div className="field">
          <label>Referent (REFERENTE)</label>
          <input name="referent" />
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea name="notes" rows={2} style={{ resize: "vertical" }} />
        </div>

        <button type="submit" className="primary" style={{ marginTop: 6, width: "fit-content" }}>
          Create contract
        </button>
      </form>
    </div>
  );
}
