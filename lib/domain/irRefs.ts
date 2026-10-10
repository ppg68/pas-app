import type { SupabaseClient } from "@supabase/supabase-js";

export type IrRef = { project: string | null; budget: string | null };

/** IR numbers are compared trimmed. */
export function irKey(n: string | null | undefined): string {
  return (n ?? "").trim();
}

/**
 * Project code and budget line of each IR request, keyed by IR number (requests.legacy_ir_number).
 * Plain object so it can be passed to client components.
 */
export async function fetchIrRefs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>
): Promise<Record<string, IrRef>> {
  const { data } = await supabase
    .from("requests")
    .select("legacy_ir_number, project_code, budget_line")
    .not("legacy_ir_number", "is", null);
  const out: Record<string, IrRef> = {};
  ((data ?? []) as { legacy_ir_number: string; project_code: string | null; budget_line: string | null }[]).forEach(
    (r) => {
      out[irKey(r.legacy_ir_number)] = { project: r.project_code, budget: r.budget_line };
    }
  );
  return out;
}
