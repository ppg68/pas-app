"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function grantContractsAccess(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email) fail("/contracts/access", "Enter an email address.");

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (!profile) {
    fail("/contracts/access", "No account found for this email — they need to sign in to PAS at least once first.");
  }

  const { error } = await supabase.from("user_roles").insert({ user_id: profile.id, role: "CONTRACTS" });
  if (error) fail("/contracts/access", error.message);

  revalidatePath("/contracts/access");
}

export async function revokeContractsAccess(userId: string) {
  const supabase = await createClient();
  await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "CONTRACTS");
  revalidatePath("/contracts/access");
}
