"use client";

import { useMemo, useState } from "react";
import { useRowFlash } from "@/lib/useRowFlash";
import Link from "next/link";
import { formatMoney, normalizeContractNumber } from "@/lib/domain/contracts";
import { updateInvoiceField, deleteInvoice } from "@/app/(dashboard)/invoices/actions";
import type { Database } from "@/types/database.types";

export type IrInvoiceRow = Database["pas"]["Tables"]["invoices"]["Row"];
export type IrInvoiceListRow = IrInvoiceRow & { contractUuid: string | null };
/** Minimal contract data used to compute "Contract value" and "Balance due" on each invoice. */
export type ContractRef = {
  id: string;
  number: string;
  subject: string;
  amount: number;
  currency: string;
  /** sum of the invoices of the older "Elenco Fatture" list for this contract */
  oldInvoiced: number;
};

type SortBy = "default" | "payment" | "due" | "amount" | "supplier";
type SortDir = "asc" | "desc";
type PaidFilter = "all" | "unpaid" | "paid";
type PaFilter = "all" | "signed" | "unsigned";

const cellInputStyle: React.CSSProperties = { minWidth: 90 };

type Col = {
  key: keyof IrInvoiceRow;
  label: string;
  sort?: SortBy;
  align?: "right";
  type: "text" | "date" | "number" | "checkbox";
  width?: number;
};

const COLUMNS: Col[] = [
  { key: "ir_number", label: "IR", type: "text", width: 70 },
  { key: "protocol", label: "Protocol", type: "text", width: 130 },
  { key: "contract_number", label: "Contract #", type: "text", width: 90 },
  { key: "supplier", label: "Supplier", sort: "supplier", type: "text", width: 200 },
  { key: "due_date", label: "Due date", sort: "due", type: "date" },
  { key: "payment_date", label: "Payment date", sort: "payment", type: "date" },
  { key: "payment_note", label: "Payment note", type: "text", width: 130 },
  { key: "currency", label: "Cur.", type: "text", width: 60 },
  { key: "amount", label: "Amount", sort: "amount", align: "right", type: "number" },
  { key: "withholding", label: "Withholding", align: "right", type: "number" },
  { key: "pa_signed", label: "PA signed", type: "checkbox" },
  { key: "project_code", label: "Project", type: "text", width: 90 },
  { key: "budget_line", label: "Budget line", type: "text", width: 120 },
  { key: "cup", label: "CUP / AID", type: "text", width: 170 },
  { key: "contract_value", label: "Contract value", align: "right", type: "number" },
  { key: "balance_due", label: "Balance due", align: "right", type: "number" },
  { key: "notes", label: "Notes", type: "text", width: 200 },
];

const NUMERIC_KEYS = new Set(["amount", "withholding", "contract_value", "balance_due"]);

export default function IrInvoicesExplorer({
  invoices,
  contracts,
}: {
  invoices: IrInvoiceListRow[];
  contracts: ContractRef[];
}) {
  const [rows, setRows] = useState(invoices);
  const contractById = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts]);
  const contractByNumber = useMemo(() => {
    const m = new Map<string, ContractRef>();
    contracts.forEach((c) => c.number && m.set(normalizeContractNumber(c.number), c));
    return m;
  }, [contracts]);
  // invoiced so far per contract: older list + IR-register invoices in the contract currency
  const invoicedByContract = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      if (!r.contractUuid) return;
      const c = contractById.get(r.contractUuid);
      if (c && c.currency === r.currency) m.set(c.id, (m.get(c.id) ?? 0) + (r.amount ?? 0));
    });
    return m;
  }, [rows, contractById]);

  /** Contract value / balance due, computed from the linked contract (null when no contract is linked). */
  function contractFigures(r: IrInvoiceListRow): { value: number; cur: string; balance: number } | null {
    const c = r.contractUuid ? contractById.get(r.contractUuid) : undefined;
    if (!c) return null;
    const invoiced = c.oldInvoiced + (invoicedByContract.get(c.id) ?? 0);
    return { value: c.amount, cur: c.currency, balance: c.amount - invoiced };
  }
  const [editingContract, setEditingContract] = useState<string | null>(null);
  useRowFlash();
  const [searchQuery, setSearchQuery] = useState("");
  const [paidFilter, setPaidFilter] = useState<PaidFilter>("all");
  const [paFilter, setPaFilter] = useState<PaFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("default");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [exporting, setExporting] = useState(false);

  function toggleSort(col: SortBy) {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("asc");
    }
  }

  function saveField(id: string, key: string, raw: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (key === "pa_signed") return { ...r, pa_signed: raw === "true" };
        if (key === "contract_number") {
          const found = raw.trim() ? contractByNumber.get(normalizeContractNumber(raw)) : undefined;
          return { ...r, contract_number: raw.trim() || null, contractUuid: found?.id ?? null, contract_id: found?.id ?? null };
        }
        if (NUMERIC_KEYS.has(key)) {
          const n = raw.trim() ? parseFloat(raw) : null;
          if (key === "amount") return { ...r, amount: n ?? r.amount };
          return { ...r, [key]: n } as IrInvoiceListRow;
        }
        return { ...r, [key]: raw.trim() || null } as IrInvoiceListRow;
      })
    );
    void updateInvoiceField(id, key, raw);
  }

  function removeRow(id: string) {
    const r = rows.find((x) => x.id === id);
    const label = r
      ? [r.supplier, r.protocol && `prot. ${r.protocol}`, r.amount != null && `${r.amount} ${r.currency}`]
          .filter(Boolean)
          .join(" · ")
      : "this invoice";
    if (!window.confirm(`Delete this invoice?

${label}

This cannot be undone.`)) return;
    setRows((prev) => prev.filter((x) => x.id !== id));
    void deleteInvoice(id);
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = rows;
    if (paidFilter === "unpaid") list = list.filter((r) => !r.payment_date);
    if (paidFilter === "paid") list = list.filter((r) => !!r.payment_date);
    if (paFilter === "signed") list = list.filter((r) => r.pa_signed);
    if (paFilter === "unsigned") list = list.filter((r) => !r.pa_signed);
    if (q) {
      list = list.filter((r) =>
        [r.supplier, r.ir_number, r.protocol, r.contract_number, r.project_code, r.cup, r.notes].some(
          (v) => (v || "").toLowerCase().includes(q)
        )
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    const time = (d: string | null) => (d ? new Date(d).getTime() : -Infinity);
    const sorted = [...list];
    if (sortBy === "payment") sorted.sort((a, b) => dir * (time(a.payment_date) - time(b.payment_date)));
    else if (sortBy === "due") sorted.sort((a, b) => dir * (time(a.due_date) - time(b.due_date)));
    else if (sortBy === "amount") sorted.sort((a, b) => dir * (a.amount - b.amount));
    else if (sortBy === "supplier")
      sorted.sort((a, b) => dir * (a.supplier || "").localeCompare(b.supplier || ""));
    else sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return sorted;
  }, [rows, searchQuery, paidFilter, paFilter, sortBy, sortDir]);

  async function exportExcel() {
    if (rows.length === 0) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const exportRows = rows.map((r) => ({
        IR: r.ir_number || "",
        Protocol: r.protocol || "",
        "Contract #": r.contract_number || "",
        Supplier: r.supplier || "",
        "Due date": r.due_date || "",
        "Payment date": r.payment_date || "",
        "Payment note": r.payment_note || "",
        Currency: r.currency,
        Amount: r.amount,
        Withholding: r.withholding ?? "",
        "PA signed": r.pa_signed ? "OK" : "",
        Project: r.project_code || "",
        "Budget line": r.budget_line || "",
        "CUP / AID": r.cup || "",
        "Contract value": contractFigures(r)?.value ?? "",
        "Balance due": contractFigures(r)?.balance ?? "",
        Notes: r.notes || "",
      }));
      const ws = XLSX.utils.json_to_sheet(exportRows);
      ws["!cols"] = Object.keys(exportRows[0]).map((k) => ({ wch: Math.min(Math.max(k.length, 12), 40) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Invoices");
      XLSX.writeFile(wb, `PAS_invoices_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  function sortArrow(col: SortBy) {
    if (sortBy !== col) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  function renderCell(r: IrInvoiceListRow, col: Col) {
    const value = r[col.key];
    // Contract #: shown as a link to the contract record; the pencil switches to editing the number.
    if (col.key === "contract_number" && r.contractUuid && editingContract !== r.id) {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Link
            href={`/contracts/${r.contractUuid}`}
            title="Open contract"
            style={{ color: "var(--navy)", fontWeight: 600, textDecoration: "underline" }}
          >
            {(value as string) || "—"}
          </Link>
          <button
            type="button"
            title="Edit contract number"
            onClick={() => setEditingContract(r.id)}
            style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-soft)", fontSize: 12 }}
          >
            ✎
          </button>
        </span>
      );
    }
    if (col.key === "contract_number") {
      return (
        <input
          autoFocus={editingContract === r.id}
          defaultValue={(value as string) ?? ""}
          onBlur={(e) => {
            saveField(r.id, col.key, e.target.value);
            setEditingContract(null);
          }}
          style={cellInputStyle}
          title={value && !r.contractUuid ? "No matching contract found" : undefined}
        />
      );
    }
    if (col.key === "contract_value" || col.key === "balance_due") {
      const f = contractFigures(r);
      if (!f) return <span style={{ color: "var(--ink-soft)" }}>—</span>;
      const v = col.key === "contract_value" ? f.value : f.balance;
      return (
        <span
          title={
            col.key === "contract_value"
              ? "Value of the linked contract"
              : "Contract value minus all invoices recorded for the contract"
          }
          style={{ color: col.key === "balance_due" && v < -0.005 ? "var(--brick)" : undefined, fontWeight: 500 }}
        >
          {formatMoney(v)}
          {f.cur !== r.currency ? ` ${f.cur}` : ""}
        </span>
      );
    }
    if (col.type === "checkbox") {
      return (
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => saveField(r.id, col.key, String(e.target.checked))}
        />
      );
    }
    if (col.type === "date") {
      return (
        <input
          type="date"
          defaultValue={(value as string) ?? ""}
          onBlur={(e) => saveField(r.id, col.key, e.target.value)}
          style={cellInputStyle}
        />
      );
    }
    if (col.type === "number") {
      return (
        <input
          type="number"
          step="0.01"
          defaultValue={value === null || value === undefined ? "" : (value as number)}
          onBlur={(e) => saveField(r.id, col.key, e.target.value)}
          style={{ ...cellInputStyle, textAlign: "right" }}
        />
      );
    }
    return (
      <input
        defaultValue={(value as string) ?? ""}
        onBlur={(e) => saveField(r.id, col.key, e.target.value)}
        style={cellInputStyle}
      />
    );
  }

  const totalAmount = filtered.reduce((s, r) => s + (r.currency === "EUR" ? r.amount : 0), 0);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          {`Invoices (${filtered.length}) · EUR total ${formatMoney(totalAmount)} (other currencies excluded)`}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/invoices/new" className="ghost">
            + New invoice
          </Link>
          <button type="button" className="export" onClick={exportExcel} disabled={rows.length === 0 || exporting}>
            {exporting ? "Exporting…" : "Export Excel"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Search by supplier, IR, protocol, contract, project, CUP…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ maxWidth: 420 }}
        />
        <select
          value={paidFilter}
          onChange={(e) => setPaidFilter(e.target.value as PaidFilter)}
          style={{ width: "auto", minWidth: 150 }}
          title="Filter by payment"
        >
          <option value="all">All payments</option>
          <option value="unpaid">Unpaid (no payment date)</option>
          <option value="paid">Paid</option>
        </select>
        <select
          value={paFilter}
          onChange={(e) => setPaFilter(e.target.value as PaFilter)}
          style={{ width: "auto", minWidth: 150 }}
          title="Filter by PA signed"
        >
          <option value="all">PA: all</option>
          <option value="signed">PA signed</option>
          <option value="unsigned">PA not signed</option>
        </select>
      </div>

      {filtered.length === 0 && <p className="empty">No invoices match.</p>}

      {filtered.length > 0 && (
        <div className="table-wrap">
          <table style={{ width: "max-content" }}>
            <thead>
              <tr>
                <th></th>
                <th></th>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={col.sort ? "sortable" : undefined}
                    style={{ textAlign: col.align === "right" ? "right" : "left" }}
                    onClick={col.sort ? () => toggleSort(col.sort!) : undefined}
                  >
                    {col.label}
                    {col.sort ? sortArrow(col.sort) : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} id={`inv-${r.id}`}>
                  <td className="center" style={{ whiteSpace: "nowrap" }}>
                    {r.request_id && (
                      <Link
                        href={`/requests/${r.request_id}`}
                        title="Open IR request"
                        style={{ fontWeight: 600, color: "var(--navy)" }}
                      >
                        IR↗
                      </Link>
                    )}{" "}
                    {r.contractUuid && (
                      <Link
                        href={`/contracts/${r.contractUuid}`}
                        title="Open contract"
                        style={{ fontWeight: 600, color: "var(--navy)" }}
                      >
                        C↗
                      </Link>
                    )}
                  </td>
                  <td className="center">
                    <button
                      type="button"
                      onClick={() => removeRow(r.id)}
                      title="Delete invoice"
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "var(--brick)",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      ×
                    </button>
                  </td>
                  {COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      style={
                        col.align === "right"
                          ? { textAlign: "right", whiteSpace: "nowrap" }
                          : { whiteSpace: "nowrap", minWidth: col.width ?? 110 }
                      }
                    >
                      {renderCell(r, col)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
