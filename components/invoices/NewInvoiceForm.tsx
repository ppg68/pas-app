"use client";

import { useMemo, useState } from "react";
import { createInvoiceFromForm } from "@/app/(dashboard)/invoices/actions";
import { formatMoney, normalizeContractNumber } from "@/lib/domain/contracts";

export type FormContract = {
  number: string;
  subject: string;
  amount: number;
  currency: string;
  project: string | null;
  invoiced: number;
};

const row: React.CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap" };

export default function NewInvoiceForm({ contracts }: { contracts: FormContract[] }) {
  const [contractNumber, setContractNumber] = useState("");
  const [supplier, setSupplier] = useState("");
  const [project, setProject] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [amount, setAmount] = useState("");
  // last values filled in automatically from a contract: they are replaced when the contract changes,
  // unless the user typed something different in the meantime
  const [autoSupplier, setAutoSupplier] = useState("");
  const [autoProject, setAutoProject] = useState("");

  const byNumber = useMemo(() => {
    const m = new Map<string, FormContract>();
    contracts.forEach((c) => m.set(normalizeContractNumber(c.number), c));
    return m;
  }, [contracts]);

  const match = contractNumber.trim() ? byNumber.get(normalizeContractNumber(contractNumber)) : undefined;
  const amountNum = parseFloat(amount.replace(",", "."));
  const sameCurrency = match ? match.currency === currency.trim().toUpperCase() : true;
  const afterThis =
    match && sameCurrency && Number.isFinite(amountNum) ? match.amount - match.invoiced - amountNum : null;

  function onContractChange(v: string) {
    setContractNumber(v);
    const c = v.trim() ? byNumber.get(normalizeContractNumber(v)) : undefined;
    if (c) {
      // fill supplier / project from the contract when empty or still holding the previous automatic value
      if (!supplier.trim() || supplier === autoSupplier) {
        setSupplier(c.subject);
        setAutoSupplier(c.subject);
      }
      if (!project.trim() || project === autoProject) {
        setProject(c.project ?? "");
        setAutoProject(c.project ?? "");
      }
      setCurrency(c.currency);
    }
  }

  return (
    <form action={createInvoiceFromForm} className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="field">
        <label>Contract # (optional — links the invoice to the contract)</label>
        <input
          name="contract_number"
          value={contractNumber}
          onChange={(e) => onContractChange(e.target.value)}
          placeholder="e.g. 36/25"
          list="contract-numbers"
          autoComplete="off"
        />
        <datalist id="contract-numbers">
          {contracts.map((c) => (
            <option key={c.number} value={c.number}>
              {c.subject}
            </option>
          ))}
        </datalist>
        {contractNumber.trim() && (
          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              color: match ? "var(--ink-soft)" : "var(--brick)",
              fontWeight: match ? 400 : 600,
            }}
          >
            {match ? (
              <>
                ✓ {match.subject} · contract value{" "}
                <b>
                  {formatMoney(match.amount)} {match.currency}
                </b>{" "}
                · already invoiced {formatMoney(match.invoiced)}
                {afterThis !== null && (
                  <>
                    {" "}
                    · balance after this invoice{" "}
                    <b style={{ color: afterThis < -0.005 ? "var(--brick)" : undefined }}>
                      {formatMoney(afterThis)} {match.currency}
                    </b>
                  </>
                )}
                {!sameCurrency && ` · ⚠ contract currency is ${match.currency}`}
              </>
            ) : (
              "No contract found with this number"
            )}
          </div>
        )}
      </div>

      <div style={row}>
        <div className="field" style={{ flex: 2, minWidth: 220 }}>
          <label>Supplier</label>
          <input name="supplier" required value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label>IR #</label>
          <input name="ir_number" />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>Protocol</label>
          <input name="protocol" />
        </div>
      </div>

      <div style={row}>
        <div className="field" style={{ flex: 1, minWidth: 130 }}>
          <label>Currency</label>
          <input name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 150 }}>
          <label>Amount</label>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 150 }}>
          <label>Withholding</label>
          <input name="withholding" type="number" step="0.01" min="0" />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 130, justifyContent: "flex-end" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input name="pa_signed" type="checkbox" style={{ width: "auto" }} /> PA signed
          </label>
        </div>
      </div>

      <div style={row}>
        <div className="field" style={{ flex: 1, minWidth: 150 }}>
          <label>Due date</label>
          <input name="due_date" type="date" />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 150 }}>
          <label>Payment date</label>
          <input name="payment_date" type="date" />
        </div>
        <div className="field" style={{ flex: 2, minWidth: 220 }}>
          <label>Payment note</label>
          <input name="payment_note" />
        </div>
      </div>

      <div style={row}>
        <div className="field" style={{ flex: 1, minWidth: 130 }}>
          <label>Project</label>
          <input name="project_code" value={project} onChange={(e) => setProject(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 130 }}>
          <label>Budget line</label>
          <input name="budget_line" />
        </div>
        <div className="field" style={{ flex: 2, minWidth: 220 }}>
          <label>CUP / AID</label>
          <input name="cup" />
        </div>
      </div>

      <div className="field">
        <label>Notes</label>
        <input name="notes" />
      </div>

      <div>
        <button type="submit" className="primary">
          Create invoice
        </button>
      </div>
    </form>
  );
}
