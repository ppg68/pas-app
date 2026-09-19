"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatMoney, type InvoiceRow } from "@/lib/domain/contracts";
import { updateInvoiceField, deleteInvoice } from "@/app/(dashboard)/contracts/actions";

export type InvoiceListRow = InvoiceRow & { contractUuid: string | null };

type SortBy = "default" | "date" | "amount" | "subject";
type SortDir = "asc" | "desc";

const inputStyle: React.CSSProperties = {
  border: "0.5px solid #d3d1c7",
  borderRadius: 6,
  padding: "7px 9px",
  fontSize: 13,
  background: "#ffffff",
  color: "#1a1a1a",
  fontFamily: "inherit",
};
const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 11,
  fontWeight: 500,
  color: "#5f5e5a",
  textTransform: "uppercase",
  letterSpacing: 0.3,
  padding: "8px 10px",
  borderBottom: "1px solid #d3d1c7",
  whiteSpace: "nowrap",
  userSelect: "none",
  position: "sticky",
  top: 0,
  background: "#fff",
};
const thSortable: React.CSSProperties = { ...th, cursor: "pointer" };
const thRight: React.CSSProperties = { ...thSortable, textAlign: "right" };
const td: React.CSSProperties = {
  fontSize: 13,
  padding: "3px 6px",
  borderBottom: "0.5px solid #e4e2da",
};
const tdRight: React.CSSProperties = { ...td, textAlign: "right", padding: "8px 10px" };
const cellInputStyle: React.CSSProperties = {
  border: "0.5px solid transparent",
  borderRadius: 4,
  padding: "5px 7px",
  fontSize: 13,
  fontFamily: "inherit",
  background: "transparent",
  width: "100%",
  boxSizing: "border-box",
  minWidth: 90,
};

type Col = {
  key: keyof InvoiceListRow;
  label: string;
  sort?: SortBy;
  align?: "right";
  type: "text" | "date" | "number" | "readonly";
  width?: number;
};

const COLUMNS: Col[] = [
  { key: "legacy_contract_id", label: "Contract ID", type: "text", width: 90 },
  { key: "subject", label: "Subject", sort: "subject", type: "text", width: 170 },
  { key: "invoice_number", label: "Invoice #", type: "text" },
  { key: "invoice_date", label: "Invoice date", sort: "date", type: "date" },
  { key: "amount", label: "Amount", sort: "amount", align: "right", type: "number" },
  { key: "protocol", label: "Protocol", type: "text" },
  { key: "description", label: "Description", type: "text", width: 180 },
  { key: "paid_amount", label: "Paid", align: "right", type: "number" },
  { key: "payment_date", label: "Payment date", type: "date" },
  { key: "payment_note", label: "Payment note", type: "text", width: 180 },
  { key: "notes", label: "Notes", type: "text", width: 180 },
];

export default function InvoicesExplorer({ invoices }: { invoices: InvoiceListRow[] }) {
  const [rows, setRows] = useState(invoices);
  const [searchQuery, setSearchQuery] = useState("");
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
        if (key === "amount" || key === "paid_amount") {
          const n = raw.trim() ? parseFloat(raw) : null;
          return { ...r, [key]: n } as InvoiceListRow;
        }
        return { ...r, [key]: raw || null } as InvoiceListRow;
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
    if (q) {
      list = list.filter(
        (r) =>
          (r.subject || "").toLowerCase().includes(q) ||
          (r.legacy_contract_id || "").toLowerCase().includes(q) ||
          (r.invoice_number || "").toLowerCase().includes(q) ||
          (r.protocol || "").toLowerCase().includes(q)
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortBy === "date") {
      list = [...list].sort((a, b) => {
        const da = a.invoice_date ? new Date(a.invoice_date).getTime() : -Infinity;
        const db = b.invoice_date ? new Date(b.invoice_date).getTime() : -Infinity;
        return dir * (da - db);
      });
    } else if (sortBy === "amount") {
      list = [...list].sort((a, b) => dir * ((a.amount || 0) - (b.amount || 0)));
    } else if (sortBy === "subject") {
      list = [...list].sort((a, b) => dir * (a.subject || "").localeCompare(b.subject || ""));
    } else {
      list = [...list].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
    return list;
  }, [rows, searchQuery, sortBy, sortDir]);

  async function exportExcel() {
    if (rows.length === 0) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const exportRows = rows.map((r) => ({
        "Contract ID": r.legacy_contract_id,
        Subject: r.subject || "",
        "Invoice #": r.invoice_number || "",
        "Invoice date": r.invoice_date || "",
        Amount: r.amount,
        Protocol: r.protocol || "",
        Description: r.description || "",
        Paid: r.paid_amount ?? "",
        "Payment date": r.payment_date || "",
        "Payment note": r.payment_note || "",
        Notes: r.notes || "",
      }));
      const ws = XLSX.utils.json_to_sheet(exportRows);
      ws["!cols"] = Object.keys(exportRows[0]).map((k) => ({ wch: Math.min(Math.max(k.length, 12), 40) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Invoices");
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `PAS_invoices_${stamp}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  function sortArrow(col: SortBy) {
    if (sortBy !== col) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  function renderCell(r: InvoiceListRow, col: Col) {
    const value = r[col.key];
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

  const totalAmount = filtered.reduce((s, r) => s + (r.amount || 0), 0);
  const totalPaid = filtered.reduce((s, r) => s + (r.paid_amount ?? 0), 0);

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
        <div style={{ fontSize: 13, color: "#5f5e5a" }}>
          {`Invoices (${filtered.length}) · total ${formatMoney(totalAmount)} · paid ${formatMoney(totalPaid)}`}
        </div>
        <button
          type="button"
          onClick={exportExcel}
          disabled={rows.length === 0 || exporting}
          style={{
            border: "0.5px solid #b4b2a9",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 500,
            background: "transparent",
            color: "#1a1a1a",
            cursor: rows.length === 0 || exporting ? "not-allowed" : "pointer",
          }}
        >
          {exporting ? "Exporting…" : "Export Excel"}
        </button>
      </div>

      <input
        placeholder="Search by contract ID, subject, invoice #, or protocol…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{ ...inputStyle, maxWidth: 420, marginBottom: 14, display: "block" }}
      />

      {filtered.length === 0 && <p style={{ fontSize: 13, color: "#5f5e5a" }}>No invoices match.</p>}

      {filtered.length > 0 && (
        <div
          style={{
            overflowX: "auto",
            border: "0.5px solid #d3d1c7",
            borderRadius: 10,
            width: "100%",
            maxWidth: "100%",
          }}
        >
          <table style={{ borderCollapse: "collapse", width: "max-content" }}>
            <thead>
              <tr>
                <th style={th}></th>
                <th style={th}></th>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    style={col.sort ? (col.align === "right" ? thRight : thSortable) : col.align === "right" ? { ...th, textAlign: "right" } : th}
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
                  <td style={{ ...td, textAlign: "center" }}>
                    {r.contractUuid ? (
                      <Link
                        href={`/contracts/${r.contractUuid}`}
                        title="Open contract"
                        style={{ color: "#1A3A5C", textDecoration: "none", fontWeight: 600 }}
                      >
                        ↗
                      </Link>
                    ) : (
                      <span title="No matching contract found" style={{ color: "#c0392b" }}>
                        ⚠
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={() => removeRow(r.id)}
                      title="Delete invoice"
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#c0392b",
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
                      style={col.align === "right" ? tdRight : { ...td, minWidth: col.width ?? 110 }}
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
