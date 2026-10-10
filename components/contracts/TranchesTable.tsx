"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { daysUntil, formatMoney } from "@/lib/domain/contracts";
import {
  addTranche,
  deleteTranche,
  toggleTranchePaid,
  updateTrancheField,
} from "@/app/(dashboard)/contracts/actions";

export type TrancheRow = {
  id: string;
  seq: number;
  label: string | null;
  amount: number;
  due_date: string | null;
  due_condition: string | null;
  paid: boolean;
  paid_date: string | null;
  paid_amount: number | null;
};

const EMPTY = { label: "", amount: "", due_date: "", due_condition: "" };

export default function TranchesTable({
  contractId,
  currency,
  contractAmount,
  tranches,
}: {
  contractId: string;
  currency: string;
  contractAmount: number;
  tranches: TrancheRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(tranches);
  const [draft, setDraft] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  // Re-sync after router.refresh() or any server revalidation.
  const [seenTranches, setSeenTranches] = useState(tranches);
  if (tranches !== seenTranches) {
    setSeenTranches(tranches);
    setRows(tranches);
  }

  function edit(id: string, patch: Partial<TrancheRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function save(id: string, field: keyof TrancheRow, raw: string) {
    await updateTrancheField(contractId, id, field, raw);
    router.refresh();
  }

  async function togglePaid(t: TrancheRow) {
    edit(t.id, { paid: !t.paid, paid_date: !t.paid ? new Date().toISOString().slice(0, 10) : null });
    await toggleTranchePaid(contractId, t.id, !t.paid);
    router.refresh();
  }

  async function remove(t: TrancheRow) {
    if (!window.confirm(`Remove tranche #${t.seq}?`)) return;
    setRows((prev) => prev.filter((r) => r.id !== t.id));
    await deleteTranche(contractId, t.id);
    router.refresh();
  }

  async function add() {
    const amount = parseFloat(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a positive amount for the new tranche.");
      return;
    }
    setError(null);
    const fd = new FormData();
    Object.entries(draft).forEach(([k, v]) => fd.set(k, v));
    await addTranche(contractId, fd);
    setDraft(EMPTY);
    router.refresh();
  }

  const scheduled = rows.reduce((s, r) => s + (r.amount || 0), 0);
  const diff = Math.round((contractAmount - scheduled) * 100) / 100;
  const paidTotal = rows.filter((r) => r.paid).reduce((s, r) => s + (r.paid_amount ?? r.amount ?? 0), 0);

  const cell: React.CSSProperties = { padding: "3px 4px" };

  return (
    <div>
      <div className="table-wrap" style={{ marginBottom: 8 }}>
        <table className="fit" style={{ tableLayout: "fixed", width: "100%" }}>
          <colgroup>
            <col style={{ width: "4%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "7%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>Label</th>
              <th className="num">Amount</th>
              <th>Due date</th>
              <th>Due condition</th>
              <th className="center">Paid</th>
              <th className="num">Paid amount</th>
              <th>Paid date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const late = !t.paid && t.due_date !== null && (daysUntil(t.due_date) ?? 0) < 0;
              return (
                <tr key={t.id} className={late ? "overdue" : undefined}>
                  <td style={cell}>{t.seq}</td>
                  <td style={cell}>
                    <input
                      value={t.label ?? ""}
                      onChange={(e) => edit(t.id, { label: e.target.value })}
                      onBlur={(e) => save(t.id, "label", e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td className="num" style={cell}>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={t.amount}
                      onChange={(e) => edit(t.id, { amount: parseFloat(e.target.value) || 0 })}
                      onBlur={(e) => save(t.id, "amount", e.target.value)}
                      style={{ width: "100%", textAlign: "right" }}
                    />
                  </td>
                  <td style={cell}>
                    <input
                      type="date"
                      value={t.due_date ?? ""}
                      onChange={(e) => edit(t.id, { due_date: e.target.value || null })}
                      onBlur={(e) => save(t.id, "due_date", e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td style={cell}>
                    <input
                      value={t.due_condition ?? ""}
                      onChange={(e) => edit(t.id, { due_condition: e.target.value })}
                      onBlur={(e) => save(t.id, "due_condition", e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td className="center" style={cell}>
                    <input
                      type="checkbox"
                      checked={t.paid}
                      onChange={() => togglePaid(t)}
                      title={t.paid ? "Mark unpaid" : "Mark paid"}
                    />
                  </td>
                  <td className="num" style={cell}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={t.paid_amount ?? ""}
                      onChange={(e) =>
                        edit(t.id, { paid_amount: e.target.value === "" ? null : parseFloat(e.target.value) })
                      }
                      onBlur={(e) => save(t.id, "paid_amount", e.target.value)}
                      style={{ width: "100%", textAlign: "right" }}
                    />
                  </td>
                  <td style={cell}>
                    <input
                      type="date"
                      value={t.paid_date ?? ""}
                      onChange={(e) => edit(t.id, { paid_date: e.target.value || null })}
                      onBlur={(e) => save(t.id, "paid_date", e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td className="center" style={cell}>
                    <button
                      type="button"
                      className="pill"
                      style={{ color: "var(--brick)" }}
                      title="Remove tranche"
                      onClick={() => remove(t)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr>
              <td style={cell}>+</td>
              <td style={cell}>
                <input
                  placeholder="new tranche label"
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  style={{ width: "100%" }}
                />
              </td>
              <td className="num" style={cell}>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0,00"
                  value={draft.amount}
                  onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && add()}
                  style={{ width: "100%", textAlign: "right" }}
                />
              </td>
              <td style={cell}>
                <input
                  type="date"
                  value={draft.due_date}
                  onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
                  style={{ width: "100%" }}
                />
              </td>
              <td style={cell}>
                <input
                  placeholder="e.g. upon final report"
                  value={draft.due_condition}
                  onChange={(e) => setDraft({ ...draft, due_condition: e.target.value })}
                  style={{ width: "100%" }}
                />
              </td>
              <td colSpan={3}></td>
              <td className="center" style={cell}>
                <button type="button" className="primary" onClick={add}>
                  Add
                </button>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 600 }}>
              <td></td>
              <td style={{ padding: "8px 6px" }}>Total tranches</td>
              <td className="num" style={{ padding: "8px 10px" }}>
                {formatMoney(scheduled)}
              </td>
              <td colSpan={3}></td>
              <td className="num" style={{ padding: "8px 10px" }}>
                {formatMoney(paidTotal)}
              </td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {error && <div className="banner error">{error}</div>}

      {rows.length > 0 &&
        (diff === 0 ? (
          <div className="stamp brand" style={{ marginBottom: 4 }}>
            ✓ Tranches match the contract amount ({formatMoney(contractAmount)} {currency})
          </div>
        ) : (
          <div className="banner error" style={{ marginBottom: 4 }}>
            ⚠ Tranches total {formatMoney(scheduled)} {currency} vs contract {formatMoney(contractAmount)}{" "}
            {currency}:{" "}
            {diff > 0
              ? `${formatMoney(diff)} not yet allocated to a tranche.`
              : `tranches exceed the contract by ${formatMoney(-diff)}.`}
          </div>
        ))}
    </div>
  );
}
