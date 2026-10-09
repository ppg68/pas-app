import type { SupabaseClient } from "@supabase/supabase-js";
import { daysUntil } from "@/lib/domain/contracts";

/** Alert window: contracts still to be paid when the project ends within this many days. */
export const DEADLINE_WARN_DAYS = 60;

/**
 * Project end dates, read from Progetti approvati through pas.project_deadlines().
 * Keyed by upper-cased project code. Empty map if the function is missing or access is denied.
 */
export async function fetchProjectDeadlines(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>
): Promise<Map<string, string>> {
  const { data } = await supabase.rpc("project_deadlines");
  const map = new Map<string, string>();
  ((data ?? []) as { codice: string; data_fine: string }[]).forEach((r) =>
    map.set(r.codice, r.data_fine)
  );
  return map;
}

export function deadlineFor(map: Map<string, string>, projectCode: string | null): string | null {
  return projectCode ? (map.get(projectCode.trim().toUpperCase()) ?? null) : null;
}

export type DeadlineAlert = "overdue" | "soon" | null;

/**
 * Open contract ("in_corso") with something still to pay, while the project it is allocated to
 * is ending or already ended.
 */
export function deadlineAlert(c: {
  status: string;
  amount: number;
  paid: number;
  unpaidTranches: number;
  project_deadline: string | null;
}): DeadlineAlert {
  if (c.status !== "in_corso" || !c.project_deadline) return null;
  if (!(c.amount - c.paid > 0.005 || c.unpaidTranches > 0)) return null;
  const d = daysUntil(c.project_deadline);
  if (d === null) return null;
  if (d < 0) return "overdue";
  return d <= DEADLINE_WARN_DAYS ? "soon" : null;
}
