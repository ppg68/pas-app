import type { SupabaseClient } from "@supabase/supabase-js";

export type IrRef = { project: string | null; budget: string | null };

/** IR numbers are compared trimmed and case-insensitive ("12/it" = "12/IT"). */
export function irKey(n: string | null | undefined): string {
  return (n ?? "").trim().toUpperCase();
}

/** IR number of an app request created before the per-office numbering: the start of its code ("796_B_SQ_..." -> "796"). */
function legacyAppNumber(code: string): string {
  return code.split("_")[0];
}

/**
 * Project code and budget line of each IR request, keyed by IR number: the number of the historic
 * register (requests.legacy_ir_number) and the number of the requests created in the app ("12/IT").
 * When the same number exists in both, the historic register entry wins (it is the one the invoices
 * were written against).
 * Plain object so it can be passed to client components.
 */
export async function fetchIrRefs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>
): Promise<Record<string, IrRef>> {
  const out: Record<string, IrRef> = {};

  const { data: created } = await supabase
    .from("requests")
    .select("code, country, ir_number, project_code, budget_line")
    .eq("is_legacy", false);
  (
    (created ?? []) as {
      code: string;
      country: string;
      ir_number: string | null;
      project_code: string | null;
      budget_line: string | null;
    }[]
  ).forEach((r) => {
    const k = irKey(r.ir_number ?? (r.country === "IT" ? legacyAppNumber(r.code) : ""));
    if (k) out[k.toUpperCase()] = { project: r.project_code, budget: r.budget_line };
  });

  const { data } = await supabase
    .from("requests")
    .select("legacy_ir_number, project_code, budget_line")
    .not("legacy_ir_number", "is", null);
  ((data ?? []) as { legacy_ir_number: string; project_code: string | null; budget_line: string | null }[]).forEach(
    (r) => {
      out[irKey(r.legacy_ir_number).toUpperCase()] = { project: r.project_code, budget: r.budget_line };
    }
  );
  return out;
}

/**
 * The request an IR number refers to: the historic register entry first, then the request created
 * in the app with that number ("12/IT", or the HQ number at the start of older codes).
 */
export async function findRequestByIr(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  ir: string
): Promise<{ id: string; project_code: string | null; budget_line: string | null } | null> {
  const key = irKey(ir);
  if (!key) return null;

  const { data: legacy } = await supabase
    .from("requests")
    .select("id, project_code, budget_line")
    .eq("legacy_ir_number", key)
    .limit(1);
  if (legacy?.[0]) return legacy[0];

  const { data: numbered } = await supabase
    .from("requests")
    .select("id, project_code, budget_line")
    .eq("ir_number", key.toUpperCase())
    .limit(1);
  if (numbered?.[0]) return numbered[0];

  // older app requests (before the per-office numbering): "_" is a wildcard in LIKE, so the exact number is checked below
  const { data: created } = await supabase
    .from("requests")
    .select("id, code, project_code, budget_line")
    .eq("is_legacy", false)
    .eq("country", "IT")
    .is("ir_number", null)
    .like("code", `${key}_%`)
    .limit(20);
  const hit = ((created ?? []) as { id: string; code: string; project_code: string | null; budget_line: string | null }[])
    .find((r) => legacyAppNumber(r.code) === key);
  return hit ? { id: hit.id, project_code: hit.project_code, budget_line: hit.budget_line } : null;
}
