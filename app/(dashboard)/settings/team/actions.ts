"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/domain/procedures";

export async function addRole(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const role = String(formData.get("role") || "") as Role;
  if (!email || !role) return;

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  // No account found for this email (they must sign in at least once first), or
  // RLS ("ADMIN manages roles") rejects the insert if the caller isn't an
  // ADMIN: either way the row doesn't appear and the list stays unchanged.
  if (!profile) return;

  await supabase.from("user_roles").insert({ user_id: profile.id, role });

  revalidatePath("/settings/team");
}

export async function removeRole(userId: string, role: Role) {
  const supabase = await createClient();
  // bind() in the form action requires a void return type — if there's an error,
  // it stays visible in the row (the role doesn't disappear from the list after submit).
  await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);

  revalidatePath("/settings/team");
}
