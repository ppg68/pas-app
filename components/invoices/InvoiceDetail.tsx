"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { updateInvoiceField } from "@/app/(dashboard)/invoices/actions";
import { formatMoney, normalizeContractNumber } from "@/lib/domain/contracts";
import { cupForProject } from "@/lib/domain/projectCups";
import { irKey, type IrRef } from "@/lib/domain/irRefs";

export type InvoiceRecord = {
  id: string;
  request_id: string | null;
  ir_number: string | null;
  protocol: string | null;
  contract_number: string | null;
  supplier: string | null;
  due_date: string | null;
  payment_date: string | null;
  payment_note: string | null;
  currency: string;
  amount: number;
  withholding: number | null;
  pa_signed: boolean;
  project_code: string | null;
  budget_line: string | null;
  cup: string | null;
  notes: string | null;
};

export type DetailContract = {
  id: string;
  number: string;
  subject: string;
  amount: number;
  currency: string;
  project: string | null;
  /** invoiced on the contract by everything EXCEPT this invoice */
  invoicedOthers: number;
};

const row: React.CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap" };

type TextKey =
  | "contract_number"
  | "supplier"
  | "ir_number"
  | "protocol"
  | "currency"
  | "payment_note"
  | "project_code"
  | "budget_line"
  | "cup"
  | "notes";
type DateKey = "due_date" | "payment_date";

export default function InvoiceDetail({
  record,
  contracts,
  projectCups,
  irRefs,
}: {
  record: InvoiceRecord;
  contracts: DetailContract[];
  projectCups: Record<string, string>;
  irRefs: Record<string, IrRef>;
}) {
  const [r, setR] = useState(record);
  const [saved, setSaved] = useState<string | null>(null);

  const byNumber = useMemo(() => {
    const m = new Map<string, DetailContract>();
    contracts.forEach((c) => m.set(normalizeContractNumber(c.number), c));
    return m;
  }, [contracts]);

  const projectCup = cupForProject(projectCups, r.project_code);
  const match = r.contract_number?.trim() ? byNumber.get(normalizeContractNumber(r.contract_number)) : undefined;
  const sameCurrency = match ? match.currency === (r.currency || "EUR").toUpperCase() : true;
  const invoicedWithThis = match ? match.invoicedOthers + (sameCurrency ? r.amount || 0 : 0) : 0;
  const balance = match ? match.amount - invoicedWithThis : 0;

  async function save(field: string, value: string) {
    await updateInvoiceField(r.id, field, value);
    setSaved(field);
    window.setTimeout(() => setSaved((s) => (s === field ? null : s)), 1500);
  }

  function textField(label: string, key: TextKey, opts?: { flex?: number; minWidth?: number }) {
    return (
      <div className="field" style={{ flex: opts?.flex ?? 1, minWidth: opts?.minWidth ?? 160 }}>
        <label>
          {label}
          {saved === key && <span style={{ color: "var(--navy)", marginLeft: 8, textTransform: "none" }}>saved ✓</span>}
        </label>
        <input
          value={r[key] ?? ""}
          onChange={(e) => setR({ ...r, [key]: e.target.value })}
          onBlur={(e) => void save(key, e.target.value)}
        />
      </div>
    );
  }

  function dateField(label: string, key: DateKey) {
    return (
      <div className="field" style={{ flex: 1, minWidth: 150 }}>
        <label>
          {label}
          {saved === key && <span style={{ color: "var(--navy)", marginLeft: 8, textTransform: "none" }}>saved ✓</span>}
        </label>
        <input
          type="date"
          value={r[key] ?? ""}
          onChange={(e) => setR({ ...r, [key]: e.target.value || null })}
          onBlur={(e) => void save(key, e.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Contract link and computed figures */}
      <div className="field">
        <label>
          Contract # (links the invoice to the contract)
          {saved === "contract_number" && (
            <span style={{ color: "var(--navy)", marginLeft: 8, textTransform: "none" }}>saved ✓</span>
          )}
        </label>
        <input
          value={r.contract_number ?? ""}
          onChange={(e) => setR({ ...r, contract_number: e.target.value })}
          onBlur={(e) => void save("contract_number", e.target.value)}
          list="contract-numbers"
          autoComplete="off"
          placeholder="e.g. 36/25"
        />
        <datalist id="contract-numbers">
          {contracts.map((c) => (
            <option key={c.id} value={c.number}>
              {c.subject}
            </option>
          ))}
        </datalist>
        {r.contract_number?.trim() && (
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
                ✓{" "}
                <Link href={`/contracts/${match.id}`} style={{ color: "var(--navy)", fontWeight: 600, textDecoration: "underline" }}>
                  {match.subject}
                </Link>{" "}
                · contract value{" "}
                <b>
                  {formatMoney(match.amount)} {match.currency}
                </b>{" "}
                · invoiced (including this one) {formatMoney(invoicedWithThis)} · balance due{" "}
                <b style={{ color: balance < -0.005 ? "var(--brick)" : undefined }}>
                  {formatMoney(balance)} {match.currency}
                </b>
                {!sameCurrency && ` · ⚠ this invoice is in ${r.currency}, the contract in ${match.currency}`}
              </>
            ) : (
              "No contract found with this number"
            )}
          </div>
        )}
      </div>

      <div style={row}>
        {textField("Supplier", "supplier", { flex: 2, minWidth: 220 })}
        <div className="field" style={{ flex: 1, minWidth: 120 }}>
          <label>
            IR # (fills project and budget line)
            {saved === "ir_number" && <span style={{ color: "var(--navy)", marginLeft: 8, textTransform: "none" }}>saved ✓</span>}
          </label>
          <input
            value={r.ir_number ?? ""}
            onChange={(e) => setR({ ...r, ir_number: e.target.value })}
            onBlur={(e) => {
              const ref = e.target.value.trim() ? irRefs[irKey(e.target.value)] : undefined;
              if (ref) {
                setR((cur) => ({
                  ...cur,
                  project_code: ref.project ?? cur.project_code,
                  budget_line: ref.budget ?? cur.budget_line,
                }));
              }
              void save("ir_number", e.target.value);
            }}
          />
          {r.ir_number?.trim() && !irRefs[irKey(r.ir_number)] && (
            <div style={{ fontSize: 12, marginTop: 4, color: "var(--ink-soft)" }}>IR not found in the app</div>
          )}
        </div>
        {textField("Protocol", "protocol")}
      </div>

      <div style={row}>
        {textField("Currency", "currency", { minWidth: 110 })}
        <div className="field" style={{ flex: 1, minWidth: 150 }}>
          <label>
            Amount
            {saved === "amount" && <span style={{ color: "var(--navy)", marginLeft: 8, textTransform: "none" }}>saved ✓</span>}
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={r.amount}
            onChange={(e) => setR({ ...r, amount: parseFloat(e.target.value) || 0 })}
            onBlur={(e) => void save("amount", e.target.value)}
          />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 150 }}>
          <label>
            Withholding
            {saved === "withholding" && (
              <span style={{ color: "var(--navy)", marginLeft: 8, textTransform: "none" }}>saved ✓</span>
            )}
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={r.withholding ?? ""}
            onChange={(e) => setR({ ...r, withholding: e.target.value === "" ? null : parseFloat(e.target.value) })}
            onBlur={(e) => void save("withholding", e.target.value)}
          />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 130, justifyContent: "flex-end" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              style={{ width: "auto" }}
              checked={r.pa_signed}
              onChange={(e) => {
                setR({ ...r, pa_signed: e.target.checked });
                void save("pa_signed", String(e.target.checked));
              }}
            />
            PA signed
          </label>
        </div>
      </div>

      <div style={row}>
        {dateField("Due date", "due_date")}
        {dateField("Payment date", "payment_date")}
        {textField("Payment note", "payment_note", { flex: 2, minWidth: 220 })}
      </div>

      <div style={row}>
        {textField("Project", "project_code", { minWidth: 130 })}
        {textField("Budget line", "budget_line", { minWidth: 130 })}
        {projectCup ? (
          <div className="field" style={{ flex: 2, minWidth: 220 }}>
            <label>CUP / AID (from Approved projects)</label>
            <input value={projectCup} readOnly title="Read from the project in Approved projects" />
          </div>
        ) : (
          textField("CUP / AID", "cup", { flex: 2, minWidth: 220 })
        )}
      </div>

      {textField("Notes", "notes", { flex: 1, minWidth: 220 })}

      {r.request_id && (
        <div style={{ fontSize: 13 }}>
          <Link href={`/requests/${r.request_id}`} style={{ color: "var(--navy)", fontWeight: 600 }}>
            Open the IR request ↗
          </Link>
        </div>
      )}
    </div>
  );
}
