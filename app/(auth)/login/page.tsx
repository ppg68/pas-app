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
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">PAS</div>
        <p className="login-sub">Sign in to Istituto Oikos&apos;s procurement &amp; contracts app.</p>

        {status === "sent" ? (
          <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>
            We sent a sign-in link to <b>{email}</b>. Open it from the same mailbox to log in.
          </p>
        ) : (
          <form onSubmit={sendMagicLink}>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Work email</label>
              <input
                type="email"
                required
                placeholder="nome.cognome@istituto-oikos.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button type="submit" className="primary" disabled={status === "sending"} style={{ width: "100%" }}>
              {status === "sending" ? "Sending…" : "Send sign-in link"}
            </button>
            {status === "error" && (
              <p style={{ color: "var(--brick)", fontSize: 13, marginTop: 10 }}>{errorMsg}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
