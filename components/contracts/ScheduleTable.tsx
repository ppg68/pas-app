"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CONTRACT_STATUS_LABEL, CONTRACT_UNITS, daysUntil, formatDateIT, formatMoney, type ContractStatus } from "@/lib/domain/contracts";

export type ScheduleRow = {
  id: string;
  contractId: string;
  contractNumber: string | null;
  subject: string;
  status: ContractStatus;
  unit: string | null;
  project: string | null;
  currency: string;
  seq: number;
  label: string | null;
  amount: number;
  dueDate: string | null;
  dueCondition: string | null;
  projectDeadline: string | null;
};

type Period = "all" | "overdue" | "30" | "60" | "90" | "nodate";

/** True when the tranche is due after the end of the project it is allocated to. */
function afterProjectEnd(r: ScheduleRow): boolean {
  return Boolean(r.dueDate && r.projectDeadline && r.dueDate > r.projectDeadline);
}

function projectEnded(r: ScheduleRow): boolean {
  const d = daysUntil(r.projectDeadline);
  return d !== null && d < 0;
}

export default function ScheduleTable({ rows }: { rows: ScheduleRow[] }) {
  const [period, setPeriod] = useState<Period>("90");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [unit, setUnit] = useState("");
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => !onlyOpen || r.status === "in_corso")
      .filter((r) => !unit || r.unit === unit)
      .filter((r) => {
        if (!needle) return true;
        return [r.subject, r.project, r.contractNumber, r.label]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle));
      })
      .filter((r) => {
        const d = daysUntil(r.dueDate);
        if (period === "all") return true;
        if (period === "nodate") return r.dueDate === null;
        if (d === null) return false;
        if (period === "overdue") return d < 0;
        return d <= Number(period); // overdue ones are always included in "next N days"
      })
      .sort((a, b) => {
        if (a.dueDate === b.dueDate) return a.subject.localeCompare(b.subject);
        if (a.dueDate === null) return 1;
        if (b.dueDate === null) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
  }, [rows, period, onlyOpen, unit, q]);

  const totals = useMemo(() => {
    const m = new Map<string, { all: number; overdue: number }>();
    filtered.forEach((r) => {
      const cur = m.get(r.currency) ?? { all: 0, overdue: 0 };
      cur.all += r.amount;
      const d = daysUntil(r.dueDate);
      if (d !== null && d < 0) cur.overdue += r.amount;
      m.set(r.currency, cur);
    });
    return [...m.entries()];
  }, [filtered]);

  const alerts = filtered.filter((r) => afterProjectEnd(r) || projectEnded(r)).length;

  async function exportExcel() {
    if (filtered.length === 0) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const out = filtered.map((r) => ({
        "Due date": r.dueDate || "",
        "Due condition": r.dueCondition || "",
        Contract: r.contractNumber || "",
        Subject: r.subject,
        Status: CONTRACT_STATUS_LABEL[r.status],
        Unit: r.unit || "",
        Project: r.project || "",
        "Project deadline": r.projectDeadline || "",
        Tranche: `#${r.seq}${r.label ? " " + r.label : ""}`,
        Currency: r.currency,
        Amount: r.amount,
        Alert: projectEnded(r) ? "project ended" : afterProjectEnd(r) ? "due after project end" : "",
      }));
      const ws = XLSX.utils.json_to_sheet(out);
      ws["!cols"] = Object.keys(out[0]).map((k) => ({ wch: Math.min(Math.max(k.length, 12), 40) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Schedule");
      XLSX.writeFile(wb, `PAS_payment_schedule_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input
          placeholder="Search by contract, subject, project or tranche…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: "1 1 260px" }}
        />
        <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
          <option value="overdue">Overdue</option>
          <option value="30">Due within 30 days</option>
          <option value="60">Due within 60 days</option>
          <option value="90">Due within 90 days</option>
          <option value="all">All</option>
          <option value="nodate">No fixed date</option>
        </select>
        <select value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="">All units</option>
          {CONTRACT_UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          Only open contracts
        </label>
        <button type="button" className="ghost" onClick={exportExcel} disabled={exporting || filtered.length === 0}>
          Export Excel
        </button>
      </div>

      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", fontSize: 13, marginBottom: 12 }}>
        <div>
          <div style={{ color: "var(--ink-soft)", fontSize: 11 }}>Tranches</div>
          <div style={{ fontWeight: 600 }}>{filtered.length}</div>
        </div>
        {totals.map(([cur, t]) => (
          <div key={cur}>
            <div style={{ color: "var(--ink-soft)", fontSize: 11 }}>Total to pay ({cur})</div>
            <div style={{ fontWeight: 600 }}>
              {formatMoney(t.all)}
              {t.overdue > 0 && (
                <span style={{ color: "var(--brick)", fontWeight: 500 }}> · overdue {formatMoney(t.overdue)}</span>
              )}
            </div>
          </div>
        ))}
        {alerts > 0 && (
          <div>
            <div style={{ color: "var(--ink-soft)", fontSize: 11 }}>Project-end alerts</div>
            <div style={{ fontWeight: 600, color: "var(--brick)" }}>{alerts}</div>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="empty">No unpaid tranches for this selection.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Due date</th>
                <th>Due condition</th>
                <th>Contract</th>
                <th>Subject</th>
                <th>Tranche</th>
                <th className="num">Amount</th>
                <th>Cur.</th>
                <th>Project</th>
                <th>Project deadline</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const d = daysUntil(r.dueDate);
                const late = d !== null && d < 0;
                const ended = projectEnded(r);
                const after = afterProjectEnd(r);
                return (
                  <tr key={r.id} className={late ? "overdue" : undefined}>
                    <td className="center">
                      <Link href={`/contracts/${r.contractId}`} title="Open contract" style={{ fontWeight: 600, color: "var(--navy)" }}>
                        ↗
                      </Link>
                    </td>
                    <td style={{ whiteSpace: "nowrap", color: late ? "var(--brick)" : undefined, fontWeight: late ? 600 : undefined }}>
                      {r.dueDate ? formatDateIT(r.dueDate) : "—"}
                      {late && ` · ${Math.abs(d!)}d late`}
                      {d !== null && d >= 0 && d <= 30 && ` · in ${d}d`}
                    </td>
                    <td>{r.dueCondition ?? ""}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{r.contractNumber ?? ""}</td>
                    <td>{r.subject}</td>
                    <td>
                      #{r.seq}
                      {r.label ? ` ${r.label}` : ""}
                    </td>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>
                      {formatMoney(r.amount)}
                    </td>
                    <td>{r.currency}</td>
                    <td>{r.project ?? ""}</td>
                    <td
                      style={{
                        whiteSpace: "nowrap",
                        color: ended || after ? "var(--brick)" : undefined,
                        fontWeight: ended || after ? 600 : undefined,
                      }}
                      title={
                        ended
                          ? "The project has ended and this tranche is still unpaid"
                          : after
                            ? "This tranche falls due after the end of the project"
                            : undefined
                      }
                    >
                      {r.projectDeadline ? formatDateIT(r.projectDeadline) : "—"}
                      {ended && " ⚠ ended"}
                      {!ended && after && " ⚠ due after end"}
                    </td>
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
