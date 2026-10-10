import type { SupabaseClient } from "@supabase/supabase-js";

/** Key used for project codes everywhere: trimmed and upper-cased. */
export function projectKey(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase();
}

/**
 * CUP of each project, read from Progetti approvati through pas.project_cups().
 * Plain object (serialisable for client components) keyed by projectKey(code).
 * Empty if the function is missing or access is denied.
 */
export async function fetchProjectCups(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>
): Promise<Record<string, string>> {
  const { data } = await supabase.rpc("project_cups");
  const out: Record<string, string> = {};
  ((data ?? []) as { codice: string; cup: string }[]).forEach((r) => {
    if (r.cup) out[r.codice] = r.cup;
  });
  return out;
}

export function cupForProject(cups: Record<string, string>, code: string | null | undefined): string | null {
  return cups[projectKey(code)] ?? null;
}
