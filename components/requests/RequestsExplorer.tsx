"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { deleteRequest } from "@/lib/domain/workflow";
import { formatDateIT, formatMoney } from "@/lib/domain/contracts";
import {
  procConfigFor,
  STAGE_LABELS,
  STAGE_TITLES,
  type ProcCode,
  type Stage,
} from "@/lib/domain/procedures";

export type RequestRow = {
  id: string;
  code: string;
  country: string;
  project_code: string;
  budget_line: string;
  description: string;
  estimated_price: number;
  currency: string;
  proc_code: ProcCode;
  derogation: boolean;
  derogation_reason: string | null;
  coordination_cost: boolean;
  cup_code: string | null;
  institutional_activity: boolean;
  occasional_collaborator: boolean;
  stage: Stage;
  folder_path: string | null;
  created_at: string;
  initiatedByName: string;
  winnerSupplier: string;
  offersCount: number;
};

type SortKey =
  | "created"
  | "code"
  | "description"
  | "project"
  | "procedure"
  | "supplier"
  | "amount"
  | "stage"
  | "initiator";
type SortDir = "asc" | "desc";

/** HQ codes start with the IR number ("790_C_3Q_…"); field-office codes don't. */
function irNumber(r: RequestRow): string {
  return r.country === "IT" ? r.code.split("_")[0] : "";
}

const SORTERS: Record<SortKey, (a: RequestRow, b: RequestRow) => number> = {
  created: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  code: (a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }),
  description: (a, b) => a.description.localeCompare(b.description),
  project: (a, b) => (a.project_code || "").localeCompare(b.project_code || ""),
  procedure: (a, b) => a.proc_code.localeCompare(b.proc_code),
  supplier: (a, b) => a.winnerSupplier.localeCompare(b.winnerSupplier),
  amount: (a, b) => (a.estimated_price || 0) - (b.estimated_price || 0),
  stage: (a, b) => STAGE_LABELS.indexOf(a.stage) - STAGE_LABELS.indexOf(b.stage),
  initiator: (a, b) => a.initiatedByName.localeCompare(b.initiatedByName),
};

const HEADERS: { key: SortKey | null; label: string; align?: "right" }[] = [
  { key: "code", label: "IR" },
  { key: "created", label: "Date" },
  { key: "description", label: "Description" },
  { key: "project", label: "Project" },
  { key: null, label: "Budget line" },
  { key: "procedure", label: "Procedure" },
  { key: "supplier", label: "Supplier" },
  { key: "amount", label: "Amount", align: "right" },
  { key: "stage", label: "Stage" },
  { key: "initiator", label: "Initiated by" },
  { key: null, label: "CUP / AID" },
  { key: null, label: "Derog." },
];

export default function RequestsExplorer({
  requests: initialRequests,
  canDelete,
}: {
  requests: RequestRow[];
  canDelete: boolean;
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [stageFilter, setStageFilter] = useState<Stage | "all">("all");
  const [exporting, setExporting] = useState(false);

  async function handleDelete(r: RequestRow) {
    const ok = window.confirm(
      `Delete request "${r.code}"?

This permanently removes the request together with its offers, signatures, documents and history. This cannot be undone.`
    );
    if (!ok) return;
    const res = await deleteRequest(r.id);
    if (!res.ok) {
      window.alert(res.error ?? "Could not delete the request.");
      return;
    }
    setRequests((prev) => prev.filter((x) => x.id !== r.id));
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "created" || key === "amount" ? "desc" : "asc");
    }
  }

  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = requests.filter((r) => stageFilter === "all" || r.stage === stageFilter);
    if (q) {
      list = list.filter((r) =>
        [
          r.code,
          r.project_code,
          r.description,
          r.budget_line,
          r.initiatedByName,
          r.cup_code,
          r.winnerSupplier,
        ].some((v) => (v || "").toLowerCase().includes(q))
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => dir * SORTERS[sortKey](a, b));
  }, [requests, searchQuery, stageFilter, sortKey, sortDir]);

  async function exportExcel() {
    if (requests.length === 0) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const rows = requests.map((r) => {
        const c = procConfigFor(r.proc_code);
        return {
          "IR Code": r.code,
          "Country/Office": r.country,
          Project: r.project_code,
          "Budget line": r.budget_line,
          Description: r.description,
          "CUP/AID code": r.cup_code || "",
          "Estimated amount": r.estimated_price,
          Currency: r.currency,
          Procedure: c.label,
          Supplier: r.winnerSupplier,
          "Institutional activity": r.institutional_activity ? "x" : "",
          "Occasional collaborator": r.occasional_collaborator ? "x" : "",
          Derogation: r.derogation ? `Yes — ${r.derogation_reason ?? ""}` : "No",
          "Coordination cost": r.coordination_cost ? "Yes" : "No",
          Stage: STAGE_TITLES[r.stage],
          "Initiated by": r.initiatedByName,
          "No. of offers": r.offersCount,
          "Archive folder path": r.folder_path || "",
        };
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = Object.keys(rows[0]).map((k) => ({
        wch: Math.min(Math.max(k.length, 14), 45),
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "IR List");
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `PAS_IR_list_${stamp}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  const arrow = (key: SortKey | null) =>
    key && sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

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
          {filteredRequests.length === requests.length
            ? `Requests (${requests.length})`
            : `Requests (${filteredRequests.length} of ${requests.length})`}
        </div>
        <button type="button" className="export" onClick={exportExcel} disabled={requests.length === 0 || exporting}>
          {exporting ? "Exporting…" : "Export Excel"}
        </button>
      </div>

      {requests.length > 0 && (
        <div className="toolbar">
          <input
            type="text"
            placeholder="Search by IR code, project, supplier, or description…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value as Stage | "all")}>
            <option value="all">All stages</option>
            {STAGE_LABELS.map((s) => (
              <option key={s} value={s}>
                {STAGE_TITLES[s]}
              </option>
            ))}
          </select>
        </div>
      )}

      {requests.length === 0 && <p className="empty">No requests yet.</p>}

      {requests.length > 0 && filteredRequests.length === 0 && (
        <p className="empty">No requests match the search.</p>
      )}

      {filteredRequests.length > 0 && (
        <div className="table-wrap">
          <table style={{ width: "max-content" }}>
            <thead>
              <tr>
                <th></th>
                {canDelete && <th></th>}
                {HEADERS.map((h) => (
                  <th
                    key={h.label}
                    className={h.key ? "sortable" : undefined}
                    style={{ textAlign: h.align ?? "left" }}
                    onClick={h.key ? () => toggleSort(h.key!) : undefined}
                  >
                    {h.label}
                    {arrow(h.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((r) => (
                <tr key={r.id}>
                  <td className="center">
                    <Link
                      href={`/requests/${r.id}`}
                      title="Open request"
                      style={{ fontWeight: 600, color: "var(--navy)" }}
                    >
                      ↗
                    </Link>
                  </td>
                  {canDelete && (
                    <td className="center">
                      <button
                        type="button"
                        onClick={() => void handleDelete(r)}
                        title="Delete request"
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
                  )}
                  <td style={{ whiteSpace: "nowrap" }} title={r.code}>
                    {irNumber(r) || r.code}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDateIT(r.created_at.slice(0, 10))}</td>
                  <td style={{ minWidth: 260, maxWidth: 420 }}>{r.description}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{r.project_code}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{r.budget_line}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{procConfigFor(r.proc_code).label}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{r.winnerSupplier}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {formatMoney(r.estimated_price)} {r.currency}
                  </td>
                  <td>
                    <span className="stamp brand">{STAGE_TITLES[r.stage]}</span>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>{r.initiatedByName}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{r.cup_code}</td>
                  <td className="center" title={r.derogation_reason ?? undefined}>
                    {r.derogation ? "✓" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
