"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type UploadedInvoiceFile = { path: string; name: string; size: number };

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx";

function safeName(name: string) {
  return name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(0, 120);
}

/** Uploads the invoice file straight to the private bucket and hands its path to the parent. */
export default function InvoiceFileInput({
  onUploaded,
  label = "Invoice file",
}: {
  onUploaded: (file: UploadedInvoiceFile) => void | Promise<void>;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) {
      setError("File larger than 20 MB.");
      return;
    }
    setBusy(true);
    try {
      const path = `invoices/${crypto.randomUUID()}/${safeName(file.name)}`;
      const { error: upErr } = await createClient()
        .storage.from("pas-request-files")
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        return;
      }
      await onUploaded({ path, name: file.name, size: file.size });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <label>{label}</label>
      <input type="file" accept={ACCEPT} onChange={(e) => void pick(e)} disabled={busy} />
      {busy && <span style={{ fontSize: 12 }}>Uploading…</span>}
      {error && <span style={{ color: "var(--brick)", fontSize: 12 }}>{error}</span>}
    </div>
  );
}
