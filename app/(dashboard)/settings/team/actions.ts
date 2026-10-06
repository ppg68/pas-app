"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/domain/procedures";

function fail(message: string): never {
  redirect(`/settings/team?error=${encodeURIComponent(message)}`);
}

export async function addRole(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const role = String(formData.get("role") || "") as Role;
  if (!email || !role) fail("Enter an email address and choose a role.");

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (!profile) {
    fail("No account found for this email. The person must sign up and sign in to PAS at least once first (check the spelling too).");
  }

  // RLS ("ADMIN manages roles") rejects the insert if the caller isn't an ADMIN.
  const { error } = await supabase.from("user_roles").insert({ user_id: profile.id, role });
  if (error) {
    fail(error.code === "23505" ? "This person already has that role." : error.message);
  }

  revalidatePath("/settings/team");
}

export async function removeRole(userId: string, role: Role) {
  const supabase = await createClient();
  // bind() in the form action requires a void return type — if there's an error,
  // it stays visible in the row (the role doesn't disappear from the list after submit).
  await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);

  revalidatePath("/settings/team");
}

export async function removePerson(userId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_person", { target: userId });
  if (error) fail(error.message);
  revalidatePath("/settings/team");
}
