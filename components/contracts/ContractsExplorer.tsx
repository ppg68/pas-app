"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CONTRACT_STATUS_LABEL, daysUntil, type ContractStatus } from "@/lib/domain/contracts";

export type ContractListRow = {
  id: string;
  legacy_id: string | null;
  subject: string;
  status: ContractStatus;
  country: string | null;
  project_code: string | null;
  ir_code: string | null;
  contract_kind: string | null;
  end_date: string | null;
  currency: string;
  amount: number;
  paid: number;
  tranchesCount: number;
};

type SortBy = "default" | "status" | "subject" | "amount" | "deadline";
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
  cursor: "pointer",
  userSelect: "none",
};
const thRight: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = {
  fontSize: 13,
  padding: "8px 10px",
  borderBottom: "0.5px solid #e4e2da",
  whiteSpace: "nowrap",
};
const tdRight: React.CSSProperties = { ...td, textAlign: "right" };
const tdSubject: React.CSSProperties = {
  ...td,
  whiteSpace: "normal",
  maxWidth: 260,
  fontWeight: 500,
};

function money(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function ContractsExplorer({ contracts }: { contracts: ContractListRow[] }) {
  const router = useRouter();
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

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = contracts.filter((c) => statusFilter === "all" || c.status === statusFilter);
    if (q) {
      list = list.filter(
        (c) =>
          (c.subject || "").toLowerCase().includes(q) ||
          (c.project_code || "").toLowerCase().includes(q) ||
          (c.ir_code || "").toLowerCase().includes(q) ||
          (c.country || "").toLowerCase().includes(q) ||
          (c.legacy_id || "").toLowerCase().includes(q)
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
  }, [contracts, searchQuery, sortBy, sortDir, statusFilter]);

  async function exportExcel() {
    if (contracts.length === 0) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const rows = contracts.map((c) => ({
        ID: c.legacy_id || "",
        Subject: c.subject,
        Status: CONTRACT_STATUS_LABEL[c.status],
        Project: c.project_code || "",
        IR: c.ir_code || "",
        "End date": c.end_date || "",
        Currency: c.currency,
        Amount: c.amount,
        Paid: c.paid,
        Balance: c.amount - c.paid,
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

  function sortArrow(col: SortBy) {
    if (sortBy !== col) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
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
          gridTemplateColumns: "1fr auto",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <input
          placeholder="Search by subject, project, IR, or country…"
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
        <div style={{ overflowX: "auto", border: "0.5px solid #d3d1c7", borderRadius: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={th}>ID</th>
                <th style={th} onClick={() => toggleSort("subject")}>
                  Subject{sortArrow("subject")}
                </th>
                <th style={th} onClick={() => toggleSort("status")}>
                  Status{sortArrow("status")}
                </th>
                <th style={th}>Project</th>
                <th style={th}>IR</th>
                <th style={th} onClick={() => toggleSort("deadline")}>
                  Deadline{sortArrow("deadline")}
                </th>
                <th style={thRight} onClick={() => toggleSort("amount")}>
                  Amount{sortArrow("amount")}
                </th>
                <th style={thRight}>Paid</th>
                <th style={thRight}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const balance = c.amount - c.paid;
                const dLeft = daysUntil(c.end_date);
                const overdue = dLeft !== null && dLeft < 0 && c.status === "in_corso";
                return (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/contracts/${c.id}`)}
                    style={{
                      cursor: "pointer",
                      background: overdue ? "#fdecea" : "transparent",
                    }}
                  >
                    <td style={{ ...td, color: "#888780" }}>{c.legacy_id || "—"}</td>
                    <td style={tdSubject}>{c.subject}</td>
                    <td style={td}>
                      <span
                        style={{
                          fontSize: 11,
                          border: "0.5px solid #b4b2a9",
                          borderRadius: 999,
                          padding: "2px 8px",
                        }}
                      >
                        {CONTRACT_STATUS_LABEL[c.status]}
                      </span>
                    </td>
                    <td style={td}>{[c.country, c.project_code].filter(Boolean).join(" · ") || "—"}</td>
                    <td style={td}>{c.ir_code || "—"}</td>
                    <td style={{ ...td, color: overdue ? "#c0392b" : undefined, fontWeight: overdue ? 500 : undefined }}>
                      {c.end_date || "—"}
                      {overdue && ` (${Math.abs(dLeft!)}d overdue)`}
                    </td>
                    <td style={tdRight}>
                      {money(c.amount)} {c.currency}
                    </td>
                    <td style={tdRight}>{money(c.paid)}</td>
                    <td style={tdRight}>{money(balance)}</td>
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
