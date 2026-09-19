"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CONTRACT_STATUS_LABEL, daysUntil, type ContractStatus } from "@/lib/domain/contracts";

export type ContractListRow = {
  id: string;
  legacy_id: string | null;
  subject: string;
  status: ContractStatus;
  country: string | null;
  project_code: string | null;
  contract_kind: string | null;
  end_date: string | null;
  currency: string;
  amount: number;
  paid: number;
  tranchesCount: number;
};

type SortBy = "default" | "status" | "subject" | "amount" | "deadline";

const inputStyle: React.CSSProperties = {
  border: "0.5px solid #d3d1c7",
  borderRadius: 6,
  padding: "7px 9px",
  fontSize: 13,
  background: "#ffffff",
  color: "#1a1a1a",
  fontFamily: "inherit",
};

export default function ContractsExplorer({ contracts }: { contracts: ContractListRow[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("default");
  const [statusFilter, setStatusFilter] = useState<"all" | ContractStatus>("in_corso");
  const [exporting, setExporting] = useState(false);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = contracts.filter((c) => statusFilter === "all" || c.status === statusFilter);
    if (q) {
      list = list.filter(
        (c) =>
          (c.subject || "").toLowerCase().includes(q) ||
          (c.project_code || "").toLowerCase().includes(q) ||
          (c.country || "").toLowerCase().includes(q) ||
          (c.legacy_id || "").toLowerCase().includes(q)
      );
    }

    if (sortBy === "status") {
      list = [...list].sort((a, b) => a.status.localeCompare(b.status));
    } else if (sortBy === "subject") {
      list = [...list].sort((a, b) => (a.subject || "").localeCompare(b.subject || ""));
    } else if (sortBy === "amount") {
      list = [...list].sort((a, b) => (b.amount || 0) - (a.amount || 0));
    } else if (sortBy === "deadline") {
      list = [...list].sort((a, b) => {
        const da = a.end_date ? new Date(a.end_date).getTime() : Infinity;
        const db = b.end_date ? new Date(b.end_date).getTime() : Infinity;
        return da - db;
      });
    }
    return list;
  }, [contracts, searchQuery, sortBy, statusFilter]);

  async function exportExcel() {
    if (contracts.length === 0) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const rows = contracts.map((c) => ({
        ID: c.legacy_id || "",
        Subject: c.subject,
        Status: CONTRACT_STATUS_LABEL[c.status],
        Country: c.country || "",
        Project: c.project_code || "",
        "Contract type": c.contract_kind || "",
        "End date": c.end_date || "",
        Currency: c.currency,
        Amount: c.amount,
        Paid: c.paid,
        Balance: c.amount - c.paid,
        Tranches: c.tranchesCount,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = Object.keys(rows[0]).map((k) => ({
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
            ? `Contracts (${filtered.length} of ${contracts.length})`
            : `Contracts (${filtered.length})`}
        </div>
        <button
          type="button"
          onClick={exportExcel}
          disabled={contracts.length === 0 || exporting}
          style={{
            border: "0.5px solid #b4b2a9",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 500,
            background: "transparent",
            color: "#1a1a1a",
            cursor: contracts.length === 0 || exporting ? "not-allowed" : "pointer",
          }}
        >
          {exporting ? "Exporting…" : "Export Excel"}
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto auto",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <input
          placeholder="Search by subject, project, or country…"
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
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          style={inputStyle}
        >
          <option value="default">Sort: most recent</option>
          <option value="status">Sort: by status</option>
          <option value="subject">Sort: by subject</option>
          <option value="amount">Sort: by amount</option>
          <option value="deadline">Sort: by deadline</option>
        </select>
      </div>

      {filtered.length === 0 && (
        <p style={{ fontSize: 13, color: "#5f5e5a" }}>No contracts match.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map((c) => {
          const balance = c.amount - c.paid;
          const dLeft = daysUntil(c.end_date);
          const overdue = dLeft !== null && dLeft < 0 && c.status === "in_corso";
          return (
            <Link
              key={c.id}
              href={`/contracts/${c.id}`}
              style={{
                border: `0.5px solid ${overdue ? "#c0392b" : "#d3d1c7"}`,
                borderRadius: 10,
                padding: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                color: "inherit",
                textDecoration: "none",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>
                  {c.subject}
                  {c.legacy_id && (
                    <span style={{ fontWeight: 400, color: "#888780" }}> · {c.legacy_id}</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "#888780" }}>
                  {[c.country, c.project_code].filter(Boolean).join(" · ")}
                  {(c.country || c.project_code) && " · "}
                  {c.amount.toLocaleString()} {c.currency} · paid {c.paid.toLocaleString()} ·
                  balance {balance.toLocaleString()}
                  {c.end_date && ` · ends ${c.end_date}`}
                  {overdue && (
                    <strong style={{ color: "#c0392b" }}> · overdue ({Math.abs(dLeft!)}d)</strong>
                  )}
                </div>
              </div>
              <div
                style={{
                  fontSize: 11,
                  border: "0.5px solid #b4b2a9",
                  borderRadius: 999,
                  padding: "3px 10px",
                  whiteSpace: "nowrap",
                }}
              >
                {CONTRACT_STATUS_LABEL[c.status]}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
