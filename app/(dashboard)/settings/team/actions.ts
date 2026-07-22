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

  // Nessun account trovato per questa email (deve prima accedere una volta), oppure
  // RLS ("RAC/CAR manage roles") rifiuta l'insert se chi lo esegue non ha già ruolo
  // RAC o CAR: in entrambi i casi la riga non compare e la lista resta invariata.
  if (!profile) return;

  await supabase.from("user_roles").insert({ user_id: profile.id, role });

  revalidatePath("/settings/team");
}

export async function removeRole(userId: string, role: Role) {
  const supabase = await createClient();
  // bind() nel form action richiede un tipo di ritorno void — l'errore, se c'è,
  // resta visibile nella riga (il ruolo non sparisce dalla lista dopo il submit).
  await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);

  revalidatePath("/settings/team");
}
