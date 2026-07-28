"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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

type SortBy = "default" | "status" | "project" | "amount" | "code";

const inputStyle: React.CSSProperties = {
  border: "0.5px solid #d3d1c7",
  borderRadius: 6,
  padding: "7px 9px",
  fontSize: 13,
  background: "#ffffff",
  color: "#1a1a1a",
  fontFamily: "inherit",
};

export default function RequestsExplorer({ requests }: { requests: RequestRow[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("default");
  const [exporting, setExporting] = useState(false);

  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = !q
      ? [...requests]
      : requests.filter(
          (r) =>
            (r.code || "").toLowerCase().includes(q) ||
            (r.project_code || "").toLowerCase().includes(q) ||
            (r.description || "").toLowerCase().includes(q) ||
            (r.budget_line || "").toLowerCase().includes(q) ||
            (r.initiatedByName || "").toLowerCase().includes(q) ||
            (r.cup_code || "").toLowerCase().includes(q)
        );

    if (sortBy === "status") {
      list = [...list].sort(
        (a, b) => STAGE_LABELS.indexOf(a.stage) - STAGE_LABELS.indexOf(b.stage)
      );
    } else if (sortBy === "project") {
      list = [...list].sort((a, b) => (a.project_code || "").localeCompare(b.project_code || ""));
    } else if (sortBy === "amount") {
      list = [...list].sort((a, b) => (b.estimated_price || 0) - (a.estimated_price || 0));
    } else if (sortBy === "code") {
      list = [...list].sort((a, b) =>
        (a.code || "").localeCompare(b.code || "", undefined, { numeric: true })
      );
    }
    return list;
  }, [requests, searchQuery, sortBy]);

  async function exportExcel() {
    if (requests.length === 0) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const rows = requests.map((r) => {
        const c = procConfigFor(r.proc_code);
        return {
          "Codice IR": r.code,
          "Paese/Sede": r.country,
          Progetto: r.project_code,
          "Linea di budget": r.budget_line,
          Descrizione: r.description,
          "Codice CUP/AID": r.cup_code || "",
          "Importo stimato": r.estimated_price,
          Valuta: r.currency,
          Procedura: c.label,
          Fornitore: r.winnerSupplier,
          "Attività istituzionale": r.institutional_activity ? "x" : "",
          "Collaboratore occasionale": r.occasional_collaborator ? "x" : "",
          Deroga: r.derogation ? `Sì — ${r.derogation_reason ?? ""}` : "No",
          "Costo di coordinamento": r.coordination_cost ? "Sì" : "No",
          Fase: STAGE_TITLES[r.stage],
          "Avviata da": r.initiatedByName,
          "N. offerte": r.offersCount,
          "Percorso cartella archivio": r.folder_path || "",
        };
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = Object.keys(rows[0]).map((k) => ({
        wch: Math.min(Math.max(k.length, 14), 45),
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Elenco IR");
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `PAS_elenco_IR_${stamp}.xlsx`);
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
            ? `Richieste (${filteredRequests.length} di ${requests.length})`
            : `Richieste (${requests.length})`}
        </div>
        <button
          type="button"
          onClick={exportExcel}
          disabled={requests.length === 0 || exporting}
          style={{
            border: "0.5px solid #b4b2a9",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 500,
            background: "transparent",
            color: "#1a1a1a",
            cursor: requests.length === 0 || exporting ? "not-allowed" : "pointer",
          }}
        >
          {exporting ? "Esportazione…" : "Esporta Excel"}
        </button>
      </div>

      {requests.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <input
            placeholder="Cerca per codice IR, progetto o descrizione…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={inputStyle}
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            style={inputStyle}
          >
            <option value="default">Ordina: più recenti</option>
            <option value="status">Ordina: per fase</option>
            <option value="project">Ordina: per progetto</option>
            <option value="amount">Ordina: per importo</option>
            <option value="code">Ordina: per codice</option>
          </select>
        </div>
      )}

      {requests.length === 0 && (
        <p style={{ fontSize: 13, color: "#5f5e5a" }}>Nessuna richiesta ancora.</p>
      )}

      {requests.length > 0 && filteredRequests.length === 0 && (
        <p style={{ fontSize: 13, color: "#5f5e5a" }}>Nessuna richiesta corrisponde alla ricerca.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filteredRequests.map((r) => (
          <Link
            key={r.id}
            href={`/requests/${r.id}`}
            style={{
              border: "0.5px solid #d3d1c7",
              borderRadius: 10,
              padding: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              color: "inherit",
              textDecoration: "none",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{r.code}</div>
              <div style={{ fontSize: 12, color: "#888780" }}>
                {r.description} · {procConfigFor(r.proc_code).label} · {r.estimated_price}{" "}
                {r.currency}
              </div>
            </div>
            <div
              style={{
                fontSize: 11,
                border: "0.5px solid #b4b2a9",
                borderRadius: 999,
                padding: "3px 10px",
              }}
            >
              {STAGE_TITLES[r.stage]}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
