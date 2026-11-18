import type { SupabaseClient } from "@supabase/supabase-js";

export const EXPENSE_MAX_BYTES = 20 * 1024 * 1024;
// only PDF files are accepted (receipts and payment proofs)
export const EXPENSE_ACCEPT = ".pdf,application/pdf";
export const isPdf = (f: File) => /\.pdf$/i.test(f.name) && (!f.type || f.type === "application/pdf");
export const EXPENSE_BUCKET = "pas-request-files";

export const safeName = (name: string) => name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(0, 120);

/** Uploads one receipt of an expense row; returns an error message or null. */
export async function uploadExpenseFile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  reportId: string,
  lineId: string | null,
  budgetLine: string,
  file: File,
  userId: string | undefined,
  kind: "receipt" | "payment_proof" = "receipt"
): Promise<string | null> {
  if (!isPdf(file)) return `${file.name}: only PDF files are accepted.`;
  if (file.size > EXPENSE_MAX_BYTES) return `${file.name}: larger than 20 MB.`;
  const path = `expenses/${reportId}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { error: upErr } = await supabase.storage.from(EXPENSE_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (upErr) return `${file.name}: ${upErr.message}`;
  const { error: dbErr } = await supabase.from("expense_files").insert({
    report_id: reportId,
    line_id: lineId,
    file_name: file.name,
    storage_path: path,
    size_bytes: file.size,
    mime_type: file.type || null,
    budget_line: budgetLine.trim() || null,
    kind,
    uploaded_by: userId,
  });
  if (dbErr) {
    await supabase.storage.from(EXPENSE_BUCKET).remove([path]);
    return `${file.name}: ${dbErr.message}`;
  }
  return null;
}
