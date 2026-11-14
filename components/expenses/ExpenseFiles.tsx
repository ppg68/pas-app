"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EXPENSE_ACCEPT, EXPENSE_BUCKET, uploadExpenseFile } from "@/lib/expenseUpload";
import { SECTION_BY_KEY, money, type ExpenseFileRow, type ExpenseLineRow } from "@/lib/domain/expenses";

const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const dmy = (s: string | null) => (s ? s.split("-").reverse().join("/") : "");

/**
 * Receipts of the report. Each expense row (all sections but mileage) has its own receipt, opened here with a
 * preview link by the people who approve. Documents without a row (older reports, extra papers) are listed apart.
 */
export default function ExpenseFiles({
  reportId,
  files,
  budgetLines,
  lines,
  canAdd,
  canRemove,
}: {
  reportId: string;
  files: ExpenseFileRow[];
  budgetLines: string[];
  lines: ExpenseLineRow[];
  canAdd: boolean;
  canRemove: boolean;
}) {
  const router = useRouter();
  const [bl, setBl] = useState(budgetLines[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    try {
      for (const file of Array.from(list)) {
        const msg = await uploadExpenseFile(supabase, reportId, null, bl, file, user?.id);
        if (msg) setError(msg);
      }
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function open(f: ExpenseFileRow) {
    const { data, error: e } = await createClient().storage.from(EXPENSE_BUCKET).createSignedUrl(f.storage_path, 120);
    if (e || !data) {
      setError(e?.message ?? "Could not open the file.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function remove(f: ExpenseFileRow) {
    if (!window.confirm(`Remove ${f.file_name}?`)) return;
    const supabase = createClient();
    const { error: dbErr } = await supabase.from("expense_files").delete().eq("id", f.id);
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    await supabase.storage.from(EXPENSE_BUCKET).remove([f.storage_path]);
    router.refresh();
  }

  const fileButtons = (list: ExpenseFileRow[]) =>
    list.map((f) => (
      <span key={f.id} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <button type="button" className="ghost" onClick={() => void open(f)}>
          {f.file_name}
        </button>
        <span style={{ color: "var(--ink-soft)", fontSize: "0.8rem" }}>{kb(f.size_bytes)}</span>
        {canRemove && (
          <button type="button" className="ghost danger" onClick={() => void remove(f)} title="Remove">
            ×
          </button>
        )}
      </span>
    ));

  const others = files.filter((f) => !f.line_id);
  const groups = [...new Set(others.map((f) => f.budget_line ?? ""))].sort();

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h2 style={{ fontSize: "1rem", marginBottom: 8 }}>Receipts</h2>
      {lines.length === 0 && others.length === 0 && <p className="subtitle" style={{ margin: "0 0 8px" }}>Mileage only: no receipts needed.</p>}
      {lines.map((l) => {
        const mine = files.filter((f) => f.line_id === l.id);
        return (
          <div
            key={l.id}
            style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "4px 0", fontSize: "0.88rem", borderBottom: "1px solid var(--line)" }}
          >
            <span style={{ flex: "1 1 320px" }}>
              <b>{l.seq}.</b> {dmy(l.line_date)} · {SECTION_BY_KEY[l.section].account} · BL {l.budget_line ?? "—"} · {l.motive || l.location || ""} ·{" "}
              <b>€ {money(l.amount_eur)}</b>
            </span>
            {mine.length > 0 ? fileButtons(mine) : <span className="stamp">receipt missing</span>}
          </div>
        );
      })}

      {others.length > 0 && (
        <>
          <div style={{ fontSize: "0.85rem", margin: "12px 0 4px" }}>
            <b>Other documents</b>
          </div>
          {groups.map((g) => (
            <div key={g} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: "0.8rem", color: "var(--ink-soft)", marginBottom: 2 }}>Budget line {g || "—"}</div>
              {others
                .filter((f) => (f.budget_line ?? "") === g)
                .map((f) => (
                  <div key={f.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "2px 0", fontSize: "0.88rem" }}>
                    {fileButtons([f])}
                  </div>
                ))}
            </div>
          ))}
        </>
      )}

      {canAdd && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
          <div className="field" style={{ width: 150 }}>
            <label>Budget line of the extra document</label>
            {budgetLines.length > 0 ? (
              <select value={bl} onChange={(e) => setBl(e.target.value)}>
                {budgetLines.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            ) : (
              <input value={bl} onChange={(e) => setBl(e.target.value)} />
            )}
          </div>
          <div className="field">
            <label>Add other documents (optional; PDF, photos, max 20 MB each)</label>
            <input
              type="file"
              multiple
              accept={EXPENSE_ACCEPT}
              disabled={busy}
              onChange={(e) => {
                void upload(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          {busy && <span style={{ fontSize: 12 }}>Uploading…</span>}
        </div>
      )}
      {error && (
        <div className="banner error" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
    </div>
  );
}
