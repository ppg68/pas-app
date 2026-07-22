import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, type Role } from "@/lib/domain/procedures";

// Ogni pagina qui sotto mostra dati specifici della sessione (ruoli, richieste
// dell'utente): senza questo, Next.js può pre-generare "/" come pagina statica in
// build e servirla identica a chiunque, ignorando la sessione reale di chi accede.
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

  const [{ data: profile }, { data: roleRows, error: roleError }] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", user?.id ?? "").maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user?.id ?? ""),
  ]);

  const roles = (roleRows ?? []).map((r) => r.role as Role);
  const canCreateRequest = roles.includes("BH");

  // DEBUG TEMPORANEO — da rimuovere una volta capito perché user_roles risulta
  // sempre vuoto in produzione nonostante il dato esista nel database.
  const debugInfo = JSON.stringify({
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    roleRows,
    roleError: roleError
      ? { message: roleError.message, code: roleError.code, details: roleError.details, hint: roleError.hint }
      : null,
  });

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <pre
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: 200,
          overflow: "auto",
          fontSize: 10,
          background: "#111",
          color: "#0f0",
          padding: 8,
          zIndex: 999,
          margin: 0,
        }}
      >
        DEBUG: {debugInfo}
      </pre>
      <aside
        style={{
          width: 220,
          borderRight: "0.5px solid #d3d1c7",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{profile?.full_name ?? "—"}</div>
          <div style={{ fontSize: 12, color: "#888780" }}>
            {roles.length > 0 ? roles.map((r) => ROLE_LABEL[r]).join(", ") : "nessun ruolo"}
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
          <Link href="/">Richieste</Link>
          {canCreateRequest && <Link href="/requests/new">Nuova richiesta</Link>}
          <Link href="/settings/team">Team</Link>
        </nav>

        <form action={signOut} style={{ marginTop: "auto" }}>
          <button
            type="submit"
            style={{
              border: "0.5px solid #d3d1c7",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 12,
              background: "transparent",
              cursor: "pointer",
              width: "100%",
            }}
          >
            Esci
          </button>
        </form>
      </aside>

      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}
