"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

type Mode = "signin" | "signup" | "forgot";

function LoginForm() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const callbackError = searchParams.get("error") === "auth";

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setInfo(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message === "Invalid login credentials" ? "Incorrect email or password." : error.message);
        setLoading(false);
        return;
      }
      router.push(next);
      router.refresh();
    } else if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setInfo("Sign-up started: check your mail to confirm the account.");
      setLoading(false);
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setInfo("If the address is registered, you'll receive an email with a link to set your password.");
      setLoading(false);
    }
  }

  const title =
    mode === "signin"
      ? "Sign in to Istituto Oikos's procurement & contracts app."
      : mode === "signup"
        ? "Create an account with your work email."
        : "Enter your email: we'll send you a link to set or reset your password.";

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">PAS</div>
        <p className="login-sub">{title}</p>

        {callbackError && !error && (
          <div className="banner error">The link is expired or was already used. Please try again.</div>
        )}
        {error && <div className="banner error">{error}</div>}
        {info && <div className="banner">{info}</div>}

        <form onSubmit={handleSubmit}>
          {mode === "signup" && (
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Full name</label>
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
          )}
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Email</label>
            <input
              type="email"
              required
              placeholder="name.surname@istituto-oikos.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {mode !== "forgot" && (
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
          )}
          <button type="submit" className="primary" disabled={loading} style={{ width: "100%" }}>
            {loading
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Sign up"
                  : "Send link"}
          </button>
        </form>

        {mode === "signin" && (
          <p style={{ fontSize: 13, marginTop: 14 }}>
            <button type="button" className="linklike" onClick={() => switchMode("forgot")}>
              Forgot or never set your password?
            </button>
          </p>
        )}

        <p style={{ fontSize: 13, marginTop: 8, color: "var(--ink-soft)" }}>
          {mode === "signin" ? (
            <>
              Don&apos;t have an account?{" "}
              <button type="button" className="linklike" onClick={() => switchMode("signup")}>
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button type="button" className="linklike" onClick={() => switchMode("signin")}>
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
