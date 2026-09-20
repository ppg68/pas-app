import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/domain/procedures";
import Sidebar from "@/components/Sidebar";

// Every page below shows session-specific data (roles, the user's own requests):
// without this, Next.js could pre-render "/" as a static page at build time and
// serve it identically to everyone, ignoring the actual session of whoever visits.
export const dynamic = "force-dynamic";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", user?.id ?? "").maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user?.id ?? ""),
  ]);

  const roles = (roleRows ?? []).map((r) => r.role as Role);
  const canCreateRequest = roles.includes("BH");
  const canSeeContracts = roles.includes("CONTRACTS");

  return (
    <div className="app">
      <Sidebar
        fullName={profile?.full_name ?? "—"}
        roles={roles}
        canCreateRequest={canCreateRequest}
        canSeeContracts={canSeeContracts}
        onSignOut={signOut}
      />
      <main>{children}</main>
    </div>
  );
}
