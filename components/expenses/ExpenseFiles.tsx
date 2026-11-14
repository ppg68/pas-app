"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ExpenseFileRow } from "@/lib/domain/expenses";

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx";
const BUCKET = "pas-request-files";

const safeName = (name: string) => name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(0, 120);
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Receipts of the report, grouped by budget line. The requester adds / removes them while allowed. */
export default function ExpenseFiles({
  reportId,
  files,
  budgetLines,
  canAdd,
  canRemove,
}: {
  reportId: string;
  files: ExpenseFileRow[];
  budgetLines: string[];
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
        if (file.size > MAX_BYTES) {
          setError(`${file.name}: larger than 20 MB.`);
          continue;
        }
        const path = `expenses/${reportId}/${crypto.randomUUID()}-${safeName(file.name)}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
        if (upErr) {
          setError(`${file.name}: ${upErr.message}`);
          continue;
        }
        const { error: dbErr } = await supabase.from("expense_files").insert({
          report_id: reportId,
          file_name: file.name,
          storage_path: path,
          size_bytes: file.size,
          mime_type: file.type || null,
          budget_line: bl.trim() || null,
          uploaded_by: user?.id,
        });
        if (dbErr) {
          await supabase.storage.from(BUCKET).remove([path]);
          setError(`${file.name}: ${dbErr.message}`);
        }
      }
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function open(f: ExpenseFileRow) {
    const { data, error: e } = await createClient().storage.from(BUCKET).createSignedUrl(f.storage_path, 120);
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
    await supabase.storage.from(BUCKET).remove([f.storage_path]);
    router.refresh();
  }

  const groups = [...new Set(files.map((f) => f.budget_line ?? ""))].sort();

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h2 style={{ fontSize: "1rem", marginBottom: 8 }}>Receipts</h2>
      {files.length === 0 && <p className="subtitle" style={{ margin: "0 0 8px" }}>No receipts attached yet.</p>}
      {groups.map((g) => (
        <div key={g} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: "0.8rem", color: "var(--ink-soft)", marginBottom: 2 }}>Budget line {g || "—"}</div>
          {files
            .filter((f) => (f.budget_line ?? "") === g)
            .map((f) => (
              <div key={f.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "2px 0", fontSize: "0.88rem" }}>
                <button type="button" className="ghost" onClick={() => void open(f)}>
                  {f.file_name}
                </button>
                <span style={{ color: "var(--ink-soft)" }}>{kb(f.size_bytes)}</span>
                {canRemove && (
                  <button type="button" className="ghost danger" onClick={() => void remove(f)} title="Remove">
                    ×
                  </button>
                )}
              </div>
            ))}
        </div>
      ))}
      {canAdd && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
          <div className="field" style={{ width: 150 }}>
            <label>Budget line of the receipts</label>
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
            <label>Add receipts (PDF, photos, max 20 MB each)</label>
            <input
              type="file"
              multiple
              accept={ACCEPT}
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
      {error && <div className="banner error" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}
