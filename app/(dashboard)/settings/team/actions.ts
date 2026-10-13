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
    // Not signed in yet: keep it as a pending role, applied automatically at their first sign-in.
    const { error: pErr } = await supabase.from("pending_roles").insert({ email, role });
    if (pErr && pErr.code !== "23505") fail(pErr.message);
    revalidatePath("/settings/team");
    return;
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

export async function cancelPending(email: string, role: Role) {
  const supabase = await createClient();
  await supabase.from("pending_roles").delete().eq("email", email).eq("role", role);
  revalidatePath("/settings/team");
}

export async function updatePersonName(userId: string, formData: FormData) {
  const name = String(formData.get("full_name") || "").trim().replace(/\s+/g, " ");
  if (!name || name.length > 120) fail("Enter the name (up to 120 characters).");

  const supabase = await createClient();
  // RLS ("ADMIN updates profiles") filters silently: no row back means the change was not allowed.
  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: name })
    .eq("id", userId)
    .select("id");
  if (error) fail(error.message);
  if (!data || data.length === 0) fail("The name could not be changed (only an ADMIN can do it).");

  revalidatePath("/settings/team");
}
