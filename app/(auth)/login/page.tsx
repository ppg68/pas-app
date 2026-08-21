"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }
    setStatus("sent");
  }

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", padding: 24 }}>
      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 16 }}>PAS — sign in</h1>

      {status === "sent" ? (
        <p style={{ fontSize: 14, color: "#5f5e5a" }}>
          We sent a sign-in link to <b>{email}</b>. Open it from the same
          mailbox to log in.
        </p>
      ) : (
        <form onSubmit={sendMagicLink}>
          <label style={{ display: "block", fontSize: 12, color: "#5f5e5a", marginBottom: 4 }}>
            Work email
          </label>
          <input
            type="email"
            required
            placeholder="nome.cognome@istituto-oikos.org"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "0.5px solid #d3d1c7",
              borderRadius: 6,
              padding: "8px 10px",
              fontSize: 14,
              marginBottom: 12,
            }}
          />
          <button
            type="submit"
            disabled={status === "sending"}
            style={{
              width: "100%",
              border: 0,
              borderRadius: 6,
              padding: "9px 14px",
              fontSize: 14,
              fontWeight: 500,
              background: "#1A3A5C",
              color: "#fff",
              cursor: status === "sending" ? "not-allowed" : "pointer",
            }}
          >
            {status === "sending" ? "Sending…" : "Send sign-in link"}
          </button>
          {status === "error" && (
            <p style={{ color: "#791f1f", fontSize: 13, marginTop: 10 }}>{errorMsg}</p>
          )}
        </form>
      )}
    </div>
  );
}
