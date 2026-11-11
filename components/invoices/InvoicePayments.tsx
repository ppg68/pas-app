"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MoneyInput from "@/components/MoneyInput";
import { addInvoicePayment, updateInvoicePayment, deleteInvoicePayment } from "@/app/(dashboard)/invoices/actions";
import { formatMoney } from "@/lib/domain/contracts";

export type InvoicePaymentRow = {
  id: string;
  payment_date: string | null;
  amount: number;
  note: string | null;
  payment_authorization_id: string | null;
};

const TOLERANCE = 1; // same as the server: this much short of the invoice amount still counts as paid

/** Payments of an invoice, one row each (advance, balance…). Only dated rows count as paid. */
export default function InvoicePayments({
  invoiceId,
  amount,
  currency,
  payments,
}: {
  invoiceId: string;
  amount: number;
  currency: string;
  payments: InvoicePaymentRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(payments);
  // after a save the server sends the list again (new rows, rows created elsewhere): follow it
  useEffect(() => setRows(payments), [payments]);

  const paid = rows.filter((p) => p.payment_date).reduce((s, p) => s + (p.amount || 0), 0);
  const toPay = rows.filter((p) => !p.payment_date).reduce((s, p) => s + (p.amount || 0), 0);
  const remaining = amount - paid;
  const status = paid >= amount - TOLERANCE && paid > 0 ? "Paid" : paid > 0 ? "Partly paid" : "Unpaid";

  function patch(id: string, p: Partial<InvoicePaymentRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }

  async function save(id: string, field: "payment_date" | "amount" | "note", value: string) {
    await updateInvoicePayment(id, invoiceId, field, value);
    router.refresh();
  }

  async function add() {
    const left = Math.max(remaining - toPay, 0);
    const res = await addInvoicePayment(invoiceId, { payment_date: "", amount: left, note: "" });
    if (!res.ok) window.alert(res.error ?? "Could not add the payment.");
    router.refresh();
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this payment?")) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
    await deleteInvoicePayment(id, invoiceId);
    router.refresh();
  }

  return (
    <div>
      <div className="field-label" style={{ marginBottom: 6 }}>Payments — {status}</div>
      <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 8px" }}>
        Invoice {formatMoney(amount)} {currency} · paid <b>{formatMoney(paid)}</b>
        {toPay > 0 && <> · authorized, date to enter <b>{formatMoney(toPay)}</b></>} · remaining{" "}
        <b>{formatMoney(Math.max(remaining, 0))}</b>. A payment counts as paid once its date is entered.
      </p>
      {rows.length === 0 && <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>No payment yet.</p>}
      {rows.map((p) => (
        <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 8 }}>
          <div className="field" style={{ width: 150 }}>
            <label>Payment date</label>
            <input
              type="date"
              value={p.payment_date ?? ""}
              onChange={(e) => patch(p.id, { payment_date: e.target.value || null })}
              onBlur={(e) => void save(p.id, "payment_date", e.target.value)}
            />
          </div>
          <div className="field" style={{ width: 150 }}>
            <label>Amount ({currency})</label>
            <MoneyInput
              value={p.amount}
              onValueChange={(v) => patch(p.id, { amount: parseFloat(v) || 0 })}
              onCommit={(v) => void save(p.id, "amount", v)}
            />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label>Note (advance, balance…)</label>
            <input
              value={p.note ?? ""}
              onChange={(e) => patch(p.id, { note: e.target.value })}
              onBlur={(e) => void save(p.id, "note", e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => void remove(p.id)}
            title="Delete payment"
            style={{ border: "none", background: "transparent", color: "var(--brick)", cursor: "pointer", fontSize: 16, paddingBottom: 8 }}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={() => void add()} style={{ marginTop: 4 }}>
        + Add payment
      </button>
    </div>
  );
}
