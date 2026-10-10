"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/domain/contracts";
import {
  createInvoice,
  deleteInvoice,
  updateInvoiceField,
} from "@/app/(dashboard)/contracts/actions";

export type ContractInvoiceRow = {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  amount: number;
  protocol: string | null;
  description: string | null;
  paid_amount: number | null;
  payment_date: string | null;
  payment_note: string | null;
};

const EMPTY = {
  invoice_number: "",
  invoice_date: "",
  amount: "",
  protocol: "",
  description: "",
  paid_amount: "",
  payment_date: "",
  payment_note: "",
};

export default function ContractInvoicesTable({
  contractId,
  legacyId,
  currency,
  contractAmount,
  invoices,
}: {
  contractId: string;
  legacyId: string;
  currency: string;
  contractAmount: number;
  invoices: ContractInvoiceRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(invoices);
  const [draft, setDraft] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  // Re-sync after router.refresh() or any server revalidation.
  const [seen, setSeen] = useState(invoices);
  if (invoices !== seen) {
    setSeen(invoices);
    setRows(invoices);
  }

  function edit(id: string, patch: Partial<ContractInvoiceRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function save(id: string, field: keyof ContractInvoiceRow, raw: string) {
    await updateInvoiceField(id, field, raw);
    router.refresh();
  }

  async function remove(r: ContractInvoiceRow) {
    if (!window.confirm(`Remove invoice ${r.invoice_number ? "#" + r.invoice_number : ""}?`)) return;
    setRows((prev) => prev.filter((x) => x.id !== r.id));
    await deleteInvoice(r.id);
    router.refresh();
  }

  async function add() {
    const amount = parseFloat(draft.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter the amount of the new invoice.");
      return;
    }
    setError(null);
    const fd = new FormData();
    Object.entries(draft).forEach(([k, v]) => fd.set(k, v));
    await createInvoice(contractId, legacyId, fd);
    setDraft(EMPTY);
    router.refresh();
  }

  const invoiced = rows.reduce((s, r) => s + (r.amount || 0), 0);
  const paid = rows.reduce((s, r) => s + (r.paid_amount ?? 0), 0);
  const toInvoice = Math.round((contractAmount - invoiced) * 100) / 100;

  const cell: React.CSSProperties = { padding: "3px 4px" };
  const money: React.CSSProperties = { width: "100%", textAlign: "right" };

  function textInput(r: ContractInvoiceRow, field: "invoice_number" | "protocol" | "description" | "payment_note") {
    return (
      <input
        value={r[field] ?? ""}
        onChange={(e) => edit(r.id, { [field]: e.target.value })}
        onBlur={(e) => save(r.id, field, e.target.value)}
        style={{ width: "100%" }}
      />
    );
  }

  function dateInput(r: ContractInvoiceRow, field: "invoice_date" | "payment_date") {
    return (
      <input
        type="date"
        value={r[field] ?? ""}
        onChange={(e) => edit(r.id, { [field]: e.target.value || null })}
        onBlur={(e) => save(r.id, field, e.target.value)}
        style={{ width: "100%" }}
      />
    );
  }

  return (
    <div>
      <div className="table-wrap" style={{ marginBottom: 8 }}>
        <table className="fit" style={{ tableLayout: "fixed", width: "100%" }}>
          <colgroup>
            <col style={{ width: "9%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "6%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Invoice date</th>
              <th className="num">Amount</th>
              <th>Protocol</th>
              <th>Description</th>
              <th className="num">Paid amount</th>
              <th>Payment date</th>
              <th>Payment note</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={cell}>{textInput(r, "invoice_number")}</td>
                <td style={cell}>{dateInput(r, "invoice_date")}</td>
                <td className="num" style={cell}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={r.amount}
                    onChange={(e) => edit(r.id, { amount: parseFloat(e.target.value) || 0 })}
                    onBlur={(e) => save(r.id, "amount", e.target.value)}
                    style={money}
                  />
                </td>
                <td style={cell}>{textInput(r, "protocol")}</td>
                <td style={cell}>{textInput(r, "description")}</td>
                <td className="num" style={cell}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={r.paid_amount ?? ""}
                    onChange={(e) =>
                      edit(r.id, { paid_amount: e.target.value === "" ? null : parseFloat(e.target.value) })
                    }
                    onBlur={(e) => save(r.id, "paid_amount", e.target.value)}
                    style={money}
                  />
                </td>
                <td style={cell}>{dateInput(r, "payment_date")}</td>
                <td style={cell}>{textInput(r, "payment_note")}</td>
                <td className="center" style={cell}>
                  <button
                    type="button"
                    className="pill"
                    style={{ color: "var(--brick)" }}
                    title="Remove invoice"
                    onClick={() => remove(r)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td style={cell}>
                <input
                  placeholder="new invoice #"
                  value={draft.invoice_number}
                  onChange={(e) => setDraft({ ...draft, invoice_number: e.target.value })}
                  style={{ width: "100%" }}
                />
              </td>
              <td style={cell}>
                <input
                  type="date"
                  value={draft.invoice_date}
                  onChange={(e) => setDraft({ ...draft, invoice_date: e.target.value })}
                  style={{ width: "100%" }}
                />
              </td>
              <td className="num" style={cell}>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={draft.amount}
                  onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && add()}
                  style={money}
                />
              </td>
              <td style={cell}>
                <input
                  value={draft.protocol}
                  onChange={(e) => setDraft({ ...draft, protocol: e.target.value })}
                  style={{ width: "100%" }}
                />
              </td>
              <td style={cell}>
                <input
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  style={{ width: "100%" }}
                />
              </td>
              <td className="num" style={cell}>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={draft.paid_amount}
                  onChange={(e) => setDraft({ ...draft, paid_amount: e.target.value })}
                  style={money}
                />
              </td>
              <td style={cell}>
                <input
                  type="date"
                  value={draft.payment_date}
                  onChange={(e) => setDraft({ ...draft, payment_date: e.target.value })}
                  style={{ width: "100%" }}
                />
              </td>
              <td style={cell}>
                <input
                  value={draft.payment_note}
                  onChange={(e) => setDraft({ ...draft, payment_note: e.target.value })}
                  style={{ width: "100%" }}
                />
              </td>
              <td className="center" style={cell}>
                <button type="button" className="primary" onClick={add}>
                  Add
                </button>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 600 }}>
              <td style={{ padding: "8px 6px" }}>Total</td>
              <td></td>
              <td className="num" style={{ padding: "8px 10px" }}>
                {formatMoney(invoiced)}
              </td>
              <td colSpan={2}></td>
              <td className="num" style={{ padding: "8px 10px" }}>
                {formatMoney(paid)}
              </td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {error && <div className="banner error">{error}</div>}

      {rows.length > 0 && (
        <div className={toInvoice < 0 ? "banner error" : "stamp"} style={{ marginBottom: 4 }}>
          {toInvoice < 0
            ? `⚠ Invoices exceed the contract amount by ${formatMoney(-toInvoice)} ${currency}.`
            : toInvoice === 0
              ? `✓ Fully invoiced (${formatMoney(contractAmount)} ${currency}).`
              : `Still to invoice: ${formatMoney(toInvoice)} ${currency} of ${formatMoney(contractAmount)} ${currency}.`}
        </div>
      )}
    </div>
  );
}
