"use client";

import { Fragment, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toggleDoc, advanceToPayment } from "@/lib/domain/workflow";
import { registerFile, getFileUrl, deleteFile, updateFileProtocol, requestArchive } from "@/lib/domain/files";

export type RequestFile = {
  id: string;
  doc_key: string;
  file_name: string;
  size_bytes: number;
  protocol: string | null;
  uploaded_at: string;
  uploaded_by_name: string;
  archived_at: string | null;
  mine: boolean;
};

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.zip";
const PREVIEW_EXT = /\.(pdf|jpe?g|png|webp)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const PROTOCOL_DOCS = ["07", "10"]; // invoice: typed; proof of payment: chosen among the protocols of the IR invoices

function kb(n: number) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function safeName(name: string) {
  return name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(0, 120);
}

export default function FilesCard({
  requestId,
  docs,
  files,
  canUpload,
  canArchive,
  archiveRequestedAt,
  archiveDoneAt,
  stage,
  canFlag,
  docsOk,
  folderPath,
  afterDocKey,
  afterDoc,
}: {
  requestId: string;
  docs: { key: string; label: string; kind: "required" | "optional" | "closing"; checked: boolean }[];
  files: RequestFile[];
  canUpload: boolean;
  canArchive: boolean;
  archiveRequestedAt: string | null;
  archiveDoneAt: string | null;
  stage: string;
  /** documents stage: a folder can be marked complete without uploading (files kept on the server) */
  canFlag: boolean;
  /** all required documents are complete: the request can go to payment */
  docsOk: boolean;
  folderPath: string | null;
  /** content shown right after the folder with this key (e.g. the offers, after 03 Quotations received) */
  afterDocKey?: string;
  afterDoc?: ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{ name: string; url: string; image: boolean } | null>(null);
  const [addingInvoice, setAddingInvoice] = useState(false);
  const [message, setMessage] = useState<{ docKey: string; text: string } | null>(null);
  const protocolRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});
  // protocols of the invoices already uploaded for this IR: a proof of payment pays one of them
  const invoiceProtocols = Array.from(
    new Set(files.filter((f) => f.doc_key === "07" && f.protocol).map((f) => f.protocol as string))
  );
  const closed = !!archiveRequestedAt;

  async function upload(docKey: string, fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setMessage(null);
    // a proof of payment for the only invoice of the IR needs no choice: it takes that invoice's protocol
    const protocol =
      docKey === "10" && invoiceProtocols.length === 1
        ? invoiceProtocols[0]
        : (protocolRefs.current[docKey]?.value.trim() ?? "");
    if (PROTOCOL_DOCS.includes(docKey) && !protocol) {
      setMessage({
        docKey,
        text:
          docKey === "10"
            ? "Choose which invoice (protocol) this payment refers to. Upload the invoice first if it is missing."
            : "Enter the accounting protocol (Callisto) first.",
      });
      return;
    }
    setBusy(docKey);
    const supabase = createClient();
    for (const file of Array.from(fileList)) {
      if (file.size > MAX_BYTES) {
        setMessage({ docKey, text: `"${file.name}" is larger than 20 MB.` });
        continue;
      }
      const path = `${requestId}/${docKey}/${crypto.randomUUID()}_${safeName(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from("pas-request-files")
        .upload(path, file, {
          contentType: file.type || (file.name.toLowerCase().endsWith(".zip") ? "application/zip" : undefined),
          upsert: false,
        });
      if (upErr) {
        setMessage({ docKey, text: `Upload failed: ${upErr.message}` });
        continue;
      }
      const res = await registerFile({
        requestId,
        docKey,
        fileName: file.name,
        storagePath: path,
        sizeBytes: file.size,
        mimeType: file.type || null,
        protocol: protocol || null,
      });
      if (!res.ok) {
        await supabase.storage.from("pas-request-files").remove([path]);
        setMessage({ docKey, text: res.error ?? "Could not save the file." });
      }
    }
    setBusy(null);
    if (docKey === "07") setAddingInvoice(false);
    router.refresh();
  }

  async function open(fileId: string) {
    const res = await getFileUrl(fileId);
    if (!res.ok || !res.url) {
      window.alert(res.error ?? "Could not open the file.");
      return;
    }
    window.open(res.url, "_blank", "noopener");
  }

  function closePreview() {
    if (previewFile) URL.revokeObjectURL(previewFile.url);
    setPreviewFile(null);
  }

  async function preview(f: RequestFile) {
    const res = await getFileUrl(f.id, true);
    if (!res.ok || !res.url) {
      window.alert(res.error ?? "Could not open the preview.");
      return;
    }
    try {
      // shown from a local blob so the storage headers cannot block the viewer
      const blob = await (await fetch(res.url)).blob();
      const type = IMAGE_EXT.test(f.file_name) ? blob.type : "application/pdf";
      const url = URL.createObjectURL(new Blob([blob], { type }));
      setPreviewFile({ name: f.file_name, url, image: IMAGE_EXT.test(f.file_name) });
    } catch {
      window.alert("Could not open the preview.");
    }
  }

  async function remove(f: RequestFile) {
    if (!window.confirm(`Delete "${f.file_name}"?`)) return;
    const res = await deleteFile(f.id, requestId);
    if (!res.ok) window.alert(res.error ?? "Could not delete the file.");
    router.refresh();
  }

  async function editProtocol(f: RequestFile) {
    const v = window.prompt("Accounting protocol (Callisto)", f.protocol ?? "");
    if (v === null) return;
    const res = await updateFileProtocol(f.id, requestId, v);
    if (!res.ok) window.alert(res.error ?? "Could not save the protocol.");
    router.refresh();
  }

  async function closeForArchive() {
    if (
      !window.confirm(
        "Close this procedure for archiving?\n\nThe documents will be moved to the server folders and removed from the PAS. Make sure the last proof of payment and its protocol are uploaded."
      )
    )
      return;
    setBusy("close");
    try {
      // the whole-procedure PDF (IR, approvals, payment authorizations) is stored with the documents: it replaces
      // the old "01 Internal Request" and "09 Payment authorization" folders
      const pdfRes = await fetch(`/requests/${requestId}/pdf`);
      if (!pdfRes.ok) {
        window.alert("Could not generate the procedure PDF. Nothing was changed.");
        return;
      }
      const blob = await pdfRes.blob();
      const cd = pdfRes.headers.get("Content-Disposition") ?? "";
      const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? "Procedure.pdf";
      const supabase = createClient();
      const path = `${requestId}/00/${crypto.randomUUID()}_${safeName(name)}`;
      const { error: upErr } = await supabase.storage
        .from("pas-request-files")
        .upload(path, blob, { contentType: "application/pdf", upsert: false });
      if (upErr) {
        window.alert(`Could not store the procedure PDF: ${upErr.message}`);
        return;
      }
      const reg = await registerFile({
        requestId,
        docKey: "00",
        fileName: name,
        storagePath: path,
        sizeBytes: blob.size,
        mimeType: "application/pdf",
        protocol: null,
      });
      if (!reg.ok) {
        await supabase.storage.from("pas-request-files").remove([path]);
        window.alert(reg.error ?? "Could not save the procedure PDF.");
        return;
      }
      const res = await requestArchive(requestId);
      if (!res.ok) window.alert(res.error ?? "Could not close the procedure.");
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Procedure files</h2>
      <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10 }}>
        PDF, images, Word, Excel or ZIP (a zipped folder stays a ZIP), max 20 MB each, as many files as you need per folder. When the procedure is closed the files are moved to the server
        archive and removed from here.
      </p>

      {docs.map((d) => {
        const list = files.filter((f) => f.doc_key === d.key);
        const needsProtocol = PROTOCOL_DOCS.includes(d.key);
        return (
          <Fragment key={d.key}>
          <div style={{ borderTop: "0.5px solid #EEF0F3", padding: "8px 0", fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 500 }}>
                {d.label}{" "}
                <span style={{ fontWeight: 400, fontSize: 12, color: list.length || d.checked ? "var(--navy)" : "var(--ink-soft)" }}>
                  {list.length
                    ? `— ✓ ${list.length} file${list.length > 1 ? "s" : ""}`
                    : d.checked
                      ? "— ✓ complete (kept on the server)"
                      : d.kind === "optional"
                        ? "— optional"
                        : d.kind === "closing"
                          ? "— needed to close"
                          : "— to do"}
                </span>
              </span>
              {canFlag && d.kind !== "closing" && list.length === 0 && (
                <form action={toggleDoc.bind(null, requestId, d.key, !d.checked)}>
                  <button
                    type="submit"
                    style={{ border: "1px solid var(--line)", borderRadius: 999, padding: "3px 10px", fontSize: 11, background: "transparent", cursor: "pointer" }}
                  >
                    {d.checked ? "Undo" : "Mark complete (saved on the server)"}
                  </button>
                </form>
              )}
            </div>
            {list.length === 0 && <div style={{ color: "var(--ink-soft)", fontSize: 12 }}>No file yet.</div>}
            {list.map((f) => (
              <div
                key={f.id}
                style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", padding: "2px 0" }}
              >
                {f.archived_at ? (
                  <span title="Archived on the server">🗄 {f.file_name}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void open(f.id)}
                    style={{ border: "none", background: "transparent", color: "var(--navy)", cursor: "pointer", padding: 0, textDecoration: "underline", fontSize: 13 }}
                  >
                    {f.file_name}
                  </button>
                )}
                {!f.archived_at && PREVIEW_EXT.test(f.file_name) && (
                  <button
                    type="button"
                    onClick={() => void preview(f)}
                    style={{ border: "1px solid var(--line)", borderRadius: 999, padding: "1px 8px", fontSize: 11, background: "transparent", cursor: "pointer", color: "var(--navy)" }}
                  >
                    Preview
                  </button>
                )}
                <span style={{ color: "var(--ink-soft)", fontSize: 11 }}>
                  {kb(f.size_bytes)} · {f.uploaded_by_name}
                  {f.archived_at ? " · archived on the server" : ""}
                </span>
                {needsProtocol && (
                  <span style={{ fontSize: 11 }}>
                    protocol: <b>{f.protocol || "—"}</b>
                    {!f.archived_at && !closed && canUpload && (
                      <button
                        type="button"
                        onClick={() => void editProtocol(f)}
                        style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 11, color: "var(--navy)" }}
                      >
                        edit
                      </button>
                    )}
                  </span>
                )}
                {!f.archived_at && !closed && (f.mine || canArchive) && (
                  <button
                    type="button"
                    onClick={() => void remove(f)}
                    title="Delete file"
                    style={{ border: "none", background: "transparent", color: "var(--brick)", cursor: "pointer", fontSize: 13 }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {canUpload && !closed && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
                {d.key === "07" && list.length > 0 && !addingInvoice && (
                  <button
                    type="button"
                    onClick={() => setAddingInvoice(true)}
                    style={{ border: "1px solid var(--line)", borderRadius: 999, padding: "3px 10px", fontSize: 11, background: "transparent", cursor: "pointer" }}
                  >
                    + Add another invoice (new protocol)
                  </button>
                )}
                {d.key === "07" && (list.length === 0 || addingInvoice) && (
                  <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                    <b>1. Protocol (required):</b>
                    <input
                      ref={(el) => {
                        protocolRefs.current[d.key] = el;
                      }}
                      placeholder="e.g. 241/2026"
                      style={{ width: 150, fontSize: 12, background: "#fff", border: "1px solid var(--navy)" }}
                    />
                    <b>2. File:</b>
                  </label>
                )}
                {d.key === "10" && invoiceProtocols.length === 0 && (
                  <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Upload the invoice (07) first.</span>
                )}
                {d.key === "10" && invoiceProtocols.length === 1 && (
                  <span style={{ fontSize: 12 }}>
                    Payment of invoice <b>{invoiceProtocols[0]}</b> — just choose the file:
                  </span>
                )}
                {d.key === "10" && invoiceProtocols.length > 1 && (
                  <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                    <b>1. Pays invoice (protocol):</b>
                    <select
                      ref={(el) => {
                        protocolRefs.current[d.key] = el;
                      }}
                      defaultValue=""
                      style={{ fontSize: 12, background: "#fff", border: "1px solid var(--navy)" }}
                    >
                      <option value="">— choose —</option>
                      {invoiceProtocols.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <b>2. File:</b>
                  </label>
                )}
                {!((d.key === "07" && list.length > 0 && !addingInvoice) || (d.key === "10" && invoiceProtocols.length === 0)) && (
                <input
                  type="file"
                  multiple
                  accept={ACCEPT}
                  disabled={busy === d.key}
                  onChange={(e) => {
                    void upload(d.key, e.target.files);
                    e.target.value = "";
                  }}
                  style={{ fontSize: 12 }}
                />
                )}
                {busy === d.key && <span style={{ fontSize: 12 }}>Uploading…</span>}
              </div>
            )}
            {message?.docKey === d.key && (
              <div style={{ color: "var(--brick)", fontSize: 12, marginTop: 4 }}>{message.text}</div>
            )}
          </div>
          {afterDoc && d.key === afterDocKey && (
            <div style={{ borderTop: "0.5px solid #EEF0F3", padding: "10px 0" }}>{afterDoc}</div>
          )}
          </Fragment>
        );
      })}

      {stage === "documents" && (
        <form
          action={advanceToPayment.bind(null, requestId)}
          style={{ borderTop: "0.5px solid #EEF0F3", paddingTop: 10, marginTop: 4, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}
        >
          {!docsOk && <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Complete the required folders (upload, or mark complete) to continue.</span>}
          <button type="submit" disabled={!docsOk} className="primary">
            Go to payment
          </button>
        </form>
      )}
      {previewFile && (
        <div
          onClick={closePreview}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 10, width: "min(1000px, 100%)", height: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--line)", fontSize: 13, gap: 8 }}>
              <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{previewFile.name}</b>
              <button type="button" className="primary" onClick={closePreview}>
                Close
              </button>
            </div>
            {previewFile.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewFile.url} alt={previewFile.name} style={{ flex: 1, minHeight: 0, objectFit: "contain", background: "#f3f4f6" }} />
            ) : (
              <iframe src={previewFile.url} title={previewFile.name} style={{ flex: 1, border: "none" }} />
            )}
          </div>
        </div>
      )}
      {folderPath && (
        <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "8px 0 0" }}>Server folder: {folderPath}</p>
      )}

      <div style={{ borderTop: "0.5px solid #EEF0F3", paddingTop: 10, marginTop: 4, fontSize: 13 }}>
        {archiveDoneAt ? (
          <span style={{ color: "var(--ink-soft)" }}>Archived on the server — the files have been removed from the PAS.</span>
        ) : closed ? (
          <span style={{ color: "var(--ink-soft)" }}>
            Closed for archiving: the files will be moved to the server folders shortly.
          </span>
        ) : canArchive && stage === "completed" ? (
          <button type="button" className="primary" onClick={() => void closeForArchive()}>
            Close procedure and archive
          </button>
        ) : (
          <span style={{ color: "var(--ink-soft)", fontSize: 12 }}>
            After the last payment, the invoice and proof of payment (with protocol) are uploaded and CAR, RAC or Contracts
            access closes the procedure for archiving.
          </span>
        )}
      </div>
    </div>
  );
}
