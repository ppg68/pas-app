"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CONTRACT_STATUS_LABEL,
  daysUntil,
  type ContractRow,
  type ContractStatus,
} from "@/lib/domain/contracts";

export type ContractListRow = ContractRow & {
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
  userSelect: "none",
  position: "sticky",
  top: 0,
  background: "#fff",
};
const thSortable: React.CSSProperties = { ...th, cursor: "pointer" };
const thRight: React.CSSProperties = { ...thSortable, textAlign: "right" };
const td: React.CSSProperties = {
  fontSize: 13,
  padding: "8px 10px",
  borderBottom: "0.5px solid #e4e2da",
  whiteSpace: "nowrap",
};
const tdRight: React.CSSProperties = { ...td, textAlign: "right" };
const tdWrap: React.CSSProperties = { ...td, whiteSpace: "normal", maxWidth: 220 };
const tdSubject: React.CSSProperties = { ...tdWrap, maxWidth: 200, fontWeight: 500 };
const tdCheck: React.CSSProperties = { ...td, textAlign: "center" };

function money(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function Check({ v }: { v: boolean }) {
  return <span style={{ color: v ? "#1A3A5C" : "#d3d1c7" }}>{v ? "✓" : "—"}</span>;
}

// Columns, in the same left-to-right order as the original "Elenco contratti"
// Google Sheet, so the shape is familiar even though this now scrolls.
type Col = {
  key: string;
  label: string;
  sort?: SortBy;
  align?: "right" | "center";
  render: (c: ContractListRow) => React.ReactNode;
};

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

  const columns: Col[] = [
    { key: "legacy_id", label: "ID", render: (c) => c.legacy_id || "—" },
    { key: "subject", label: "Subject", sort: "subject", render: (c) => c.subject },
    {
      key: "status",
      label: "Status",
      sort: "status",
      render: (c) => (
        <span style={{ fontSize: 11, border: "0.5px solid #b4b2a9", borderRadius: 999, padding: "2px 8px" }}>
          {CONTRACT_STATUS_LABEL[c.status]}
        </span>
      ),
    },
    { key: "typology", label: "Typology", render: (c) => c.typology || "—" },
    { key: "unit", label: "Unit", render: (c) => c.unit || "—" },
    { key: "role_title", label: "Role", render: (c) => c.role_title || "—" },
    { key: "activity", label: "Activity", render: (c) => c.activity || "—" },
    { key: "country", label: "Country", render: (c) => c.country || "—" },
    { key: "signed_date", label: "Signed date", render: (c) => c.signed_date || "—" },
    { key: "start_date", label: "Start", render: (c) => c.start_date || "—" },
    {
      key: "end_date",
      label: "End",
      sort: "deadline",
      render: (c) => {
        const dLeft = daysUntil(c.end_date);
        const overdue = dLeft !== null && dLeft < 0 && c.status === "in_corso";
        return (
          <span style={{ color: overdue ? "#c0392b" : undefined, fontWeight: overdue ? 500 : undefined }}>
            {c.end_date || "—"}
            {overdue && ` (${Math.abs(dLeft!)}d overdue)`}
          </span>
        );
      },
    },
    { key: "contract_kind", label: "Contract type", render: (c) => c.contract_kind || "—" },
    {
      key: "amount",
      label: "Amount",
      sort: "amount",
      align: "right",
      render: (c) => `${money(c.amount)} ${c.currency}`,
    },
    { key: "paid", label: "Paid", align: "right", render: (c) => money(c.paid) },
    { key: "balance", label: "Balance", align: "right", render: (c) => money(c.amount - c.paid) },
    { key: "project_code", label: "Project", render: (c) => c.project_code || "—" },
    { key: "ir_code", label: "IR", render: (c) => c.ir_code || "—" },
    {
      key: "payment_terms",
      label: "Payment terms",
      render: (c) => c.payment_terms || "—",
    },
    { key: "signed", label: "Signed", align: "center", render: (c) => <Check v={c.signed} /> },
    { key: "privacy", label: "Privacy", align: "center", render: (c) => <Check v={c.privacy} /> },
    {
      key: "code_of_conduct",
      label: "Code of Conduct",
      align: "center",
      render: (c) => <Check v={c.code_of_conduct} />,
    },
    { key: "psea_policy", label: "PSEA Policy", align: "center", render: (c) => <Check v={c.psea_policy} /> },
    {
      key: "criminal_record_check",
      label: "Criminal record check",
      align: "center",
      render: (c) => <Check v={c.criminal_record_check} />,
    },
    {
      key: "technical_requirements_check",
      label: "Technical requirements",
      align: "center",
      render: (c) => <Check v={c.technical_requirements_check} />,
    },
    {
      key: "labor_inspectorate_notice",
      label: "Labor inspectorate",
      align: "center",
      render: (c) => <Check v={c.labor_inspectorate_notice} />,
    },
    { key: "referent", label: "Referent", render: (c) => c.referent || "—" },
    { key: "notes", label: "Notes", render: (c) => c.notes || "—" },
    { key: "project_deadline", label: "Project deadline", render: (c) => c.project_deadline || "—" },
  ];

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
        <div
          style={{
            overflowX: "auto",
            border: "0.5px solid #d3d1c7",
            borderRadius: 10,
            maxHeight: "75vh",
            overflowY: "auto",
          }}
        >
          <table style={{ borderCollapse: "collapse", width: "max-content" }}>
            <thead>
              <tr>
                {columns.map((col) => (
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
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/contracts/${c.id}`)}
                    style={{ cursor: "pointer", background: overdue ? "#fdecea" : "transparent" }}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        style={
                          col.align === "right"
                            ? tdRight
                            : col.align === "center"
                              ? tdCheck
                              : col.key === "subject"
                                ? tdSubject
                                : col.key === "notes" || col.key === "payment_terms"
                                  ? tdWrap
                                  : td
                        }
                      >
                        {col.render(c)}
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
