"use client";

import { useState } from "react";
import { createPaymentAuthorization } from "@/lib/domain/workflow";

export type PaInvoiceOption = {
  id: string;
  label: string;
  supplier: string | null;
  amount: number;
  currency: string;
};

/**
 * Payment authorization (form PR04.AA05) prepared by the Budget Holder / PM. The fixed data of the
 * request (IR number, project, budget line, procedure) is shown read-only; CAR / RAC approve it afterwards.
 */
export default function PaymentAuthorizationForm({
  requestId,
  fixed,
  invoices,
  winnerSupplier,
  offerValue,
  authorizedTotal,
  currency,
  defaultBankDescription,
  direct = false,
}: {
  requestId: string;
  fixed: { ir: string; project: string; budgetLine: string; procedure: string; projectName?: string };
  invoices: PaInvoiceOption[];
  winnerSupplier: string | null;
  offerValue: number | null;
  authorizedTotal: number;
  currency: string;
  defaultBankDescription: string;
  /** Direct purchase: recorded without approval. */
  direct?: boolean;
}) {
  const [invoiceId, setInvoiceId] = useState("");
  const [beneficiary, setBeneficiary] = useState(winnerSupplier ?? "");
  const [amount, setAmount] = useState("");
  const [cur, setCur] = useState(currency);
  const [balance, setBalance] = useState("");
  const [balanceTouched, setBalanceTouched] = useState(false);
  const [paymentType, setPaymentType] = useState("bank_transfer");

  const fmt = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function suggestedBalance(amountStr: string): string {
    const a = parseFloat(amountStr.replace(",", "."));
    if (offerValue == null || !Number.isFinite(a)) return "";
    return String(Math.round((offerValue - authorizedTotal - a) * 100) / 100);
  }

  function onAmount(v: string) {
    setAmount(v);
    if (!balanceTouched) setBalance(suggestedBalance(v));
  }

  function onInvoice(id: string) {
    setInvoiceId(id);
    const inv = invoices.find((i) => i.id === id);
    if (!inv) return;
    if (inv.supplier) setBeneficiary(inv.supplier);
    setCur(inv.currency);
    onAmount(String(inv.amount));
  }

  const rowStyle: React.CSSProperties = { display: "flex", gap: 10 };

  return (
    <form
      action={createPaymentAuthorization.bind(null, requestId)}
      style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}
    >
      <div style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.6 }}>
        IR <b>{fixed.ir}</b> · project <b>{fixed.project}</b> · budget line <b>{fixed.budgetLine}</b> · procedure{" "}
        <b>{fixed.procedure}</b>
        <br />
        {offerValue != null && (
          <>
            Winning offer <b>{fmt(offerValue)} {currency}</b> · already authorized{" "}
            <b>{fmt(authorizedTotal)} {currency}</b> · remaining{" "}
            <b>{fmt(offerValue - authorizedTotal)} {currency}</b>
          </>
        )}
      </div>

      {invoices.length > 0 && (
        <div className="field">
          <label>Invoice this payment refers to (optional — fills in beneficiary and amount)</label>
          <select name="invoice_id" value={invoiceId} onChange={(e) => onInvoice(e.target.value)}>
            <option value="">— none —</option>
            {invoices.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label>Description of the payment (advance, balance, activity, supply of…)</label>
        <input name="description" required placeholder="e.g. Balance — supply of …" />
      </div>

      <div className="field">
        <label>Description to be entered in the bank transfer (CUP / AID or project code)</label>
        <input name="bank_description" defaultValue={defaultBankDescription} />
      </div>

      <div style={rowStyle}>
        <div className="field" style={{ width: 200 }}>
          <label>Payment type</label>
          <select name="payment_type" value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cash">Cash</option>
            <option value="other">Other (specify)</option>
          </select>
        </div>
        {paymentType === "other" && (
          <div className="field" style={{ flex: 1 }}>
            <label>Specify</label>
            <input name="payment_type_other" required />
          </div>
        )}
      </div>

      <div className="field">
        <label>Name of payment beneficiary</label>
        <input name="beneficiary" required value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} />
      </div>

      <div className="field">
        <label>Details for payment (bank account, etc.)</label>
        <textarea name="payment_details" rows={2} />
      </div>

      <div style={rowStyle}>
        <div className="field" style={{ flex: 1 }}>
          <label>Amount to be paid</label>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            value={amount}
            onChange={(e) => onAmount(e.target.value)}
          />
        </div>
        <div className="field" style={{ width: 90 }}>
          <label>Currency</label>
          <input name="currency" value={cur} onChange={(e) => setCur(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Balance still to be paid</label>
          <input
            name="balance_after"
            type="number"
            step="0.01"
            value={balance}
            onChange={(e) => {
              setBalance(e.target.value);
              setBalanceTouched(true);
            }}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Euro equivalent (InforEuro)</label>
          <input name="euro_equivalent" type="number" step="0.01" min="0" />
        </div>
      </div>

      <button type="submit" className="primary" style={{ width: "fit-content" }}>
        {direct ? "Submit payment data" : "Submit for authorization"}
      </button>
    </form>
  );
}
