"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/domain/contracts";
import { updateInvoiceField, createInvoice, deleteInvoice } from "@/app/(dashboard)/invoices/actions";
import type { Database } from "@/types/database.types";

export type IrInvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];

type SortBy = "default" | "payment" | "due" | "amount" | "supplier";
type SortDir = "asc" | "desc";
type PaidFilter = "all" | "unpaid" | "paid";

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

export default function IrInvoicesExplorer({ invoices }: { invoices: IrInvoiceRow[] }) {
  const [rows, setRows] = useState(invoices);
  const [searchQuery, setSearchQuery] = useState("");
  const [paidFilter, setPaidFilter] = useState<PaidFilter>("all");
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
        if (NUMERIC_KEYS.has(key)) {
          const n = raw.trim() ? parseFloat(raw) : null;
          if (key === "amount") return { ...r, amount: n ?? r.amount };
          return { ...r, [key]: n } as IrInvoiceRow;
        }
        return { ...r, [key]: raw.trim() || null } as IrInvoiceRow;
      })
    );
    void updateInvoiceField(id, key, raw);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    void deleteInvoice(id);
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = rows;
    if (paidFilter === "unpaid") list = list.filter((r) => !r.payment_date);
    if (paidFilter === "paid") list = list.filter((r) => !!r.payment_date);
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
  }, [rows, searchQuery, paidFilter, sortBy, sortDir]);

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
        "Contract value": r.contract_value ?? "",
        "Balance due": r.balance_due ?? "",
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

  function renderCell(r: IrInvoiceRow, col: Col) {
    const value = r[col.key];
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
          <button
            type="button"
            className="ghost"
            onClick={() => void createInvoice().then(() => window.location.reload())}
          >
            + New invoice
          </button>
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
        <select value={paidFilter} onChange={(e) => setPaidFilter(e.target.value as PaidFilter)}>
          <option value="all">All</option>
          <option value="unpaid">Unpaid (no payment date)</option>
          <option value="paid">Paid</option>
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
                <tr key={r.id}>
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
                    {r.contract_id && (
                      <Link
                        href={`/contracts/${r.contract_id}`}
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
