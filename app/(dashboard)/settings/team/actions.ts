"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/domain/procedures";

export async function addRole(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const role = String(formData.get("role") || "") as Role;
  if (!email || !role) return { error: "Email e ruolo sono obbligatori." };

  const supabase = await createClient();

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (profileErr) return { error: profileErr.message };
  if (!profile) {
    return {
      error: `Nessun account trovato per ${email}. Deve prima accedere una volta con il link via email.`,
    };
  }

  // RLS ("RAC/CAR manage roles") rifiuta questo insert se chi lo esegue non ha
  // già ruolo RAC o CAR — l'errore che torna da qui è quindi già la verità di fondo,
  // non solo un controllo di comodo lato UI.
  const { error } = await supabase.from("user_roles").insert({ user_id: profile.id, role });
  if (error) return { error: error.message };

  revalidatePath("/settings/team");
  return { error: null };
}

export async function removeRole(userId: string, role: Role) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("role", role);
  if (error) return { error: error.message };

  revalidatePath("/settings/team");
  return { error: null };
}
