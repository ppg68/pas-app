"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CONTRACT_STATUS_LABEL,
  CONTRACT_KIND_SUGGESTIONS,
  daysUntil,
  formatMoney,
  type ContractRow,
  type ContractStatus,
} from "@/lib/domain/contracts";
import { updateContractField } from "@/app/(dashboard)/contracts/actions";

export type ContractListRow = ContractRow & {
  paid: number;
  tranchesCount: number;
};

type SortBy = "default" | "status" | "subject" | "amount" | "deadline";
type SortDir = "asc" | "desc";
type FieldType = "readonly" | "text" | "select" | "date" | "number" | "checkbox";

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
const tdCheck: React.CSSProperties = { ...td, textAlign: "center" };
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

// Columns, in the same left-to-right order as the original "Elenco contratti"
// Google Sheet, so the shape is familiar even though this now scrolls.
// `type` drives which inline-editable control the cell renders as — every
// column here saves directly to the DB on blur/change, same as the sibling
// Geko Lite/RICO apps' inline-edit tables.
type Col = {
  key: string;
  label: string;
  sort?: SortBy;
  align?: "right" | "center";
  type: FieldType;
  width?: number;
  options?: string[];
};

const COLUMNS: Col[] = [
  { key: "legacy_id", label: "ID", type: "text", width: 70 },
  { key: "subject", label: "Subject", sort: "subject", type: "text", width: 170 },
  { key: "status", label: "Status", sort: "status", type: "select", options: ["in_corso", "concluso", "annullato"] },
  { key: "typology", label: "Typology", type: "text" },
  { key: "unit", label: "Unit", type: "text", width: 180 },
  { key: "role_title", label: "Role", type: "text" },
  { key: "activity", label: "Activity", type: "text", width: 180 },
  { key: "country", label: "Country", type: "text" },
  { key: "signed_date", label: "Signed date", type: "date" },
  { key: "start_date", label: "Start", type: "date" },
  { key: "end_date", label: "End", sort: "deadline", type: "date" },
  { key: "contract_kind", label: "Contract type", type: "text" },
  { key: "amount", label: "Amount", sort: "amount", align: "right", type: "number" },
  { key: "paid", label: "Paid", align: "right", type: "readonly" },
  { key: "balance", label: "Balance", align: "right", type: "readonly" },
  { key: "project_code", label: "Project", type: "text" },
  { key: "ir_code", label: "IR", type: "text" },
  { key: "payment_terms", label: "Payment terms", type: "text", width: 220 },
  { key: "signed", label: "Signed", align: "center", type: "checkbox" },
  { key: "privacy", label: "Privacy", align: "center", type: "checkbox" },
  { key: "code_of_conduct", label: "Code of Conduct", align: "center", type: "checkbox" },
  { key: "psea_policy", label: "PSEA Policy", align: "center", type: "checkbox" },
  { key: "criminal_record_check", label: "Criminal record check", align: "center", type: "checkbox" },
  { key: "technical_requirements_check", label: "Technical requirements", align: "center", type: "checkbox" },
  { key: "labor_inspectorate_notice", label: "Labor inspectorate", align: "center", type: "checkbox" },
  { key: "referent", label: "Referent", type: "text" },
  { key: "notes", label: "Notes", type: "text", width: 220 },
  { key: "project_deadline", label: "Project deadline", type: "date" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cellValue(row: ContractListRow, key: string): any {
  return (row as unknown as Record<string, unknown>)[key];
}

export default function ContractsExplorer({ contracts }: { contracts: ContractListRow[] }) {
  const [rows, setRows] = useState(contracts);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hoveringRef = useRef(false);

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    const el = scrollRef.current;
    if (!el || e.deltaY === 0) return;
    if (el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft += e.deltaY;
    e.preventDefault();
  }

  // Arrow keys, tied to mouse position rather than DOM focus — with editable
  // cells now in every row, focus constantly moves between inputs, so a
  // focus-based handler on the scroll container would be unreliable.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!hoveringRef.current) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      const el = scrollRef.current;
      if (!el || el.scrollWidth <= el.clientWidth) return;
      if (e.key === "ArrowRight") {
        el.scrollLeft += 60;
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        el.scrollLeft -= 60;
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("default");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [statusFilter, setStatusFilter] = useState<"all" | ContractStatus>("in_corso");
  const [exporting, setExporting] = useState(false);

  function toggleSort(col: SortBy) {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  }

  // Optimistic local save: update the row in state immediately, then persist.
  // The whitelist of what's actually writable lives server-side in
  // updateContractField — this just reflects the change back into the UI.
  function saveField(id: string, key: string, raw: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (key === "amount") {
          const n = parseFloat(raw);
          return Number.isFinite(n) ? { ...r, amount: n } : r;
        }
        if (key === "status") return { ...r, status: raw as ContractStatus };
        return { ...r, [key]: raw || null } as ContractListRow;
      })
    );
    void updateContractField(id, key, raw);
  }

  function saveCheckbox(id: string, key: string, checked: boolean) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: checked } : r)));
    void updateContractField(id, key, String(checked));
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = rows.filter((c) => statusFilter === "all" || c.status === statusFilter);
    if (q) {
      list = list.filter(
        (c) =>
          (c.subject || "").toLowerCase().includes(q) ||
          (c.project_code || "").toLowerCase().includes(q) ||
          (c.ir_code || "").toLowerCase().includes(q) ||
          (c.country || "").toLowerCase().includes(q) ||
          (c.legacy_id || "").toLowerCase().includes(q) ||
          (c.referent || "").toLowerCase().includes(q)
      );
    }

    const dir = sortDir === "asc" ? 1 : -1;
    if (sortBy === "status") {
      list = [...list].sort((a, b) => dir * a.status.localeCompare(b.status));
    } else if (sortBy === "subject") {
      list = [...list].sort((a, b) => dir * (a.subject || "").localeCompare(b.subject || ""));
    } else if (sortBy === "amount") {
      list = [...list].sort((a, b) => dir * ((a.amount || 0) - (b.amount || 0)));
    } else if (sortBy === "deadline") {
      list = [...list].sort((a, b) => {
        const da = a.end_date ? new Date(a.end_date).getTime() : Infinity;
        const db = b.end_date ? new Date(b.end_date).getTime() : Infinity;
        return dir * (da - db);
      });
    }
    return list;
  }, [rows, searchQuery, sortBy, sortDir, statusFilter]);

  async function exportExcel() {
    if (rows.length === 0) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const exportRows = rows.map((c) => ({
        ID: c.legacy_id || "",
        Subject: c.subject,
        Status: CONTRACT_STATUS_LABEL[c.status],
        Typology: c.typology || "",
        Unit: c.unit || "",
        Role: c.role_title || "",
        Activity: c.activity || "",
        Country: c.country || "",
        "Signed date": c.signed_date || "",
        Start: c.start_date || "",
        End: c.end_date || "",
        Currency: c.currency,
        Amount: c.amount,
        "Contract type": c.contract_kind || "",
        Paid: c.paid,
        Balance: c.amount - c.paid,
        Project: c.project_code || "",
        IR: c.ir_code || "",
        "Payment terms": c.payment_terms || "",
        Signed: c.signed ? "x" : "",
        Privacy: c.privacy ? "x" : "",
        "Code of Conduct": c.code_of_conduct ? "x" : "",
        "PSEA Policy": c.psea_policy ? "x" : "",
        "Criminal record check": c.criminal_record_check ? "x" : "",
        "Technical requirements check": c.technical_requirements_check ? "x" : "",
        "Labor inspectorate notice": c.labor_inspectorate_notice ? "x" : "",
        Referent: c.referent || "",
        Notes: c.notes || "",
        "Project deadline": c.project_deadline || "",
      }));
      const ws = XLSX.utils.json_to_sheet(exportRows);
      ws["!cols"] = Object.keys(exportRows[0]).map((k) => ({
        wch: Math.min(Math.max(k.length, 12), 40),
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Contracts");
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `PAS_contracts_${stamp}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  function sortArrow(col: SortBy) {
    if (sortBy !== col) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  function renderCell(c: ContractListRow, col: Col) {
    const value = cellValue(c, col.key);

    if (col.type === "readonly") {
      if (col.key === "paid") return formatMoney(c.paid);
      if (col.key === "balance") return formatMoney(c.amount - c.paid);
      return value ?? "—";
    }

    if (col.type === "checkbox") {
      return (
        <input
          type="checkbox"
          defaultChecked={Boolean(value)}
          onChange={(e) => saveCheckbox(c.id, col.key, e.target.checked)}
        />
      );
    }

    if (col.type === "select") {
      return (
        <select
          defaultValue={c.status}
          onChange={(e) => saveField(c.id, col.key, e.target.value)}
          style={{ ...cellInputStyle, cursor: "pointer" }}
        >
          {(col.options ?? []).map((o) => (
            <option key={o} value={o}>
              {CONTRACT_STATUS_LABEL[o as ContractStatus] ?? o}
            </option>
          ))}
        </select>
      );
    }

    if (col.type === "date") {
      const overdue =
        col.key === "end_date" &&
        c.status === "in_corso" &&
        (() => {
          const d = daysUntil(c.end_date);
          return d !== null && d < 0;
        })();
      return (
        <input
          type="date"
          defaultValue={(value as string) ?? ""}
          onBlur={(e) => saveField(c.id, col.key, e.target.value)}
          style={{
            ...cellInputStyle,
            color: overdue ? "#c0392b" : undefined,
            fontWeight: overdue ? 500 : undefined,
          }}
        />
      );
    }

    if (col.type === "number") {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
          <input
            type="number"
            step="0.01"
            defaultValue={value as number}
            onBlur={(e) => saveField(c.id, col.key, e.target.value)}
            style={{ ...cellInputStyle, textAlign: "right", minWidth: 90 }}
          />
          <span style={{ color: "#888780" }}>{c.currency}</span>
        </div>
      );
    }

    // text
    if (col.key === "contract_kind") {
      return (
        <>
          <input
            list="contract-kind-options"
            defaultValue={(value as string) ?? ""}
            onBlur={(e) => saveField(c.id, col.key, e.target.value)}
            style={cellInputStyle}
          />
          <datalist id="contract-kind-options">
            {CONTRACT_KIND_SUGGESTIONS.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </>
      );
    }
    return (
      <input
        defaultValue={(value as string) ?? ""}
        onBlur={(e) => saveField(c.id, col.key, e.target.value)}
        style={cellInputStyle}
      />
    );
  }

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
          {searchQuery
            ? `Contracts (${filtered.length} of ${rows.length})`
            : `Contracts (${filtered.length})`}
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 10,
          marginBottom: 14,
          maxWidth: 700,
        }}
      >
        <input
          placeholder="Search by subject, project, IR, country, or referent…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={inputStyle}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | ContractStatus)}
          style={inputStyle}
        >
          <option value="all">All statuses</option>
          <option value="in_corso">In corso</option>
          <option value="concluso">Concluso</option>
          <option value="annullato">Annullato</option>
        </select>
      </div>

      {filtered.length === 0 && (
        <p style={{ fontSize: 13, color: "#5f5e5a" }}>No contracts match.</p>
      )}

      {filtered.length > 0 && (
        <p style={{ fontSize: 12, color: "#888780", marginBottom: 6 }}>
          Click a cell to edit it directly (saved automatically). Click the ↗ to open the full
          record (tranches, compliance checklist). Scroll, or hover the table and use ← → , to
          see more columns.
        </p>
      )}

      {filtered.length > 0 && (
        <div
          ref={scrollRef}
          tabIndex={0}
          onWheel={handleWheel}
          onMouseEnter={() => {
            hoveringRef.current = true;
          }}
          onMouseLeave={() => {
            hoveringRef.current = false;
          }}
          style={{
            overflowX: "auto",
            border: "0.5px solid #d3d1c7",
            borderRadius: 10,
            width: "100%",
            maxWidth: "100%",
            outline: "none",
          }}
        >
          <table style={{ borderCollapse: "collapse", width: "max-content" }}>
            <thead>
              <tr>
                <th style={th}></th>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    style={
                      col.sort
                        ? col.align === "right"
                          ? thRight
                          : thSortable
                        : col.align === "right"
                          ? { ...th, textAlign: "right" }
                          : col.align === "center"
                            ? { ...th, textAlign: "center" }
                            : th
                    }
                    onClick={col.sort ? () => toggleSort(col.sort!) : undefined}
                  >
                    {col.label}
                    {col.sort ? sortArrow(col.sort) : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const dLeft = daysUntil(c.end_date);
                const overdue = dLeft !== null && dLeft < 0 && c.status === "in_corso";
                return (
                  <tr key={c.id} style={{ background: overdue ? "#fdecea" : "transparent" }}>
                    <td style={{ ...td, textAlign: "center" }}>
                      <Link
                        href={`/contracts/${c.id}`}
                        title="Open full record"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          color: "#1A3A5C",
                          textDecoration: "none",
                          fontWeight: 600,
                        }}
                      >
                        ↗
                      </Link>
                    </td>
                    {COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        style={
                          col.align === "right"
                            ? tdRight
                            : col.align === "center"
                              ? tdCheck
                              : { ...td, minWidth: col.width ?? 110 }
                        }
                      >
                        {renderCell(c, col)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
