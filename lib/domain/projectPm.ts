import type { SupabaseClient } from "@supabase/supabase-js";
import { projectKey } from "@/lib/domain/projectCups";

/**
 * Project manager (user id) of each project, read from Progetti approvati through pas.project_pms().
 * Plain object keyed by projectKey(code). Empty if the function is missing or access is denied.
 */
export async function fetchProjectPms(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>
): Promise<Record<string, string>> {
  const { data } = await supabase.rpc("project_pms");
  const out: Record<string, string> = {};
  ((data ?? []) as { codice: string; pm_user_id: string }[]).forEach((r) => {
    if (r.pm_user_id) out[r.codice] = r.pm_user_id;
  });
  return out;
}

export function pmForProject(pms: Record<string, string>, code: string | null | undefined): string | null {
  return pms[projectKey(code)] ?? null;
}
