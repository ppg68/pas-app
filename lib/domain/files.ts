"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "pas-request-files";
const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** Invoice: the accounting protocol (Callisto) is required, it names the Contabilità folder. The proof of payment follows the invoice. */
const PROTOCOL_DOCS = ["07"];

type Result = { ok: boolean; error?: string };

/** Registers a file already uploaded to Storage by the browser, and ticks the matching document as present. */
export async function registerFile(input: {
  requestId: string;
  docKey: string;
  fileName: string;
  storagePath: string;
  sizeBytes: number;
  mimeType: string | null;
  protocol: string | null;
}): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (input.sizeBytes > MAX_FILE_BYTES) return { ok: false, error: "File larger than 20 MB." };
  if (!input.storagePath.startsWith(`${input.requestId}/${input.docKey}/`)) {
    return { ok: false, error: "Invalid file path." };
  }
  const protocol = (input.protocol ?? "").trim() || null;
  if (PROTOCOL_DOCS.includes(input.docKey) && !protocol) {
    return { ok: false, error: "The accounting protocol is required for invoices." };
  }

  const { error } = await supabase.from("request_files").insert({
    request_id: input.requestId,
    doc_key: input.docKey,
    file_name: input.fileName,
    storage_path: input.storagePath,
    size_bytes: input.sizeBytes,
    mime_type: input.mimeType,
    protocol,
    uploaded_by: user.id,
  });
  if (error) return { ok: false, error: error.message };

  await supabase.from("request_documents").upsert({
    request_id: input.requestId,
    doc_key: input.docKey,
    checked: true,
    checked_by: user.id,
    checked_at: new Date().toISOString(),
  });
  revalidatePath(`/requests/${input.requestId}`);
  return { ok: true };
}

/** Short-lived download link (60 s). The row is read under RLS first, so only allowed users get one. */
export async function getFileUrl(fileId: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const supabase = await createClient();
  const { data: f } = await supabase
    .from("request_files")
    .select("storage_path, file_name, archived_at")
    .eq("id", fileId)
    .maybeSingle();
  if (!f) return { ok: false, error: "File not found." };
  if (f.archived_at) return { ok: false, error: "This file has been archived on the server." };
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(f.storage_path, 60, { download: f.file_name });
  if (error || !data) return { ok: false, error: error?.message ?? "Could not create the link." };
  return { ok: true, url: data.signedUrl };
}

export async function updateFileProtocol(fileId: string, requestId: string, protocol: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("request_files")
    .update({ protocol: protocol.trim() || null })
    .eq("id", fileId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/requests/${requestId}`);
  return { ok: true };
}

export async function deleteFile(fileId: string, requestId: string): Promise<Result> {
  const supabase = await createClient();
  const { data: f } = await supabase
    .from("request_files")
    .select("storage_path, doc_key")
    .eq("id", fileId)
    .maybeSingle();
  if (!f) return { ok: false, error: "File not found." };
  const { error } = await supabase.from("request_files").delete().eq("id", fileId);
  if (error) return { ok: false, error: error.message };
  await supabase.storage.from(BUCKET).remove([f.storage_path]);

  // no file left in that folder: the document goes back to "to do"
  const { count } = await supabase
    .from("request_files")
    .select("id", { count: "exact", head: true })
    .eq("request_id", requestId)
    .eq("doc_key", f.doc_key);
  if (!count) {
    await supabase
      .from("request_documents")
      .update({ checked: false })
      .eq("request_id", requestId)
      .eq("doc_key", f.doc_key);
  }
  revalidatePath(`/requests/${requestId}`);
  return { ok: true };
}

/**
 * Closes the procedure for archiving: Elisa (CONTRACTS) or an administrator confirms that the last proof of payment
 * is uploaded. The archive script then moves the files to the server and empties the PAS.
 */
export async function requestArchive(requestId: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const allowed = (roles ?? []).some((r) => r.role === "CONTRACTS" || r.role === "ADMIN");
  if (!allowed) return { ok: false, error: "Only the Contracts/Accounting role can close a procedure for archiving." };

  const { data: req } = await supabase
    .from("requests")
    .select("stage, archive_requested_at")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "Request not found." };
  if (req.archive_requested_at) return { ok: false, error: "Already closed for archiving." };
  if (req.stage !== "completed") {
    return { ok: false, error: "The request must be completed (all payments authorized) before archiving." };
  }

  const { data: files } = await supabase
    .from("request_files")
    .select("doc_key, protocol")
    .eq("request_id", requestId)
    .is("archived_at", null);
  const has = (k: string) => (files ?? []).some((f) => f.doc_key === k);
  if (!has("07")) return { ok: false, error: "Upload the invoice (07) first." };
  if (!has("10")) return { ok: false, error: "Upload the proof of payment (10) first." };
  if ((files ?? []).some((f) => PROTOCOL_DOCS.includes(f.doc_key) && !f.protocol)) {
    return { ok: false, error: "Every invoice needs its accounting protocol." };
  }

  const { error } = await supabase
    .from("requests")
    .update({ archive_requested_at: new Date().toISOString(), archive_requested_by: user.id })
    .eq("id", requestId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/requests/${requestId}`);
  return { ok: true };
}
