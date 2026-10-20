/**
 * Auth.tsx
 * Sign In / Sign Up / Google OAuth page.
 * Redirects to /closet once a session is established.
 *
 * Autofill prevention strategy:
 * - Inputs start readOnly and switch to editable on focus/click.
 *   Chrome/Safari only autofill inputs that are writable at page-load time.
 * - `key={mode}` remounts the entire form on mode switch, clearing all DOM state.
 * - `autoComplete="off"` + non-standard name attributes discourage managers.
 * - State is reset to "" on every mode switch.
 */
import { useState, useEffect, useRef, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "../lib/supabase";
import "../App.css";

type AuthMode = "signin" | "signup";

export default function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // readOnly prevents browser autofill until user interacts
  const [emailReadOnly, setEmailReadOnly] = useState(true);
  const [pwReadOnly, setPwReadOnly] = useState(true);

  const emailRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  // Remove readOnly after a short delay so autofill has already missed its window
  useEffect(() => {
    const t = setTimeout(() => {
      setEmailReadOnly(false);
      setPwReadOnly(false);
    }, 300);
    return () => clearTimeout(t);
  }, [mode]); // Re-runs on mode change, re-applying readOnly briefly

  // Redirect already-authenticated users
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
        navigate("/closet", { replace: true });
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/closet", { replace: true });
    });
    return () => listener.subscription.unsubscribe();
  }, [navigate]);

  const handleModeSwitch = (newMode: AuthMode) => {
    if (newMode !== mode) {
      // Explicitly clear all field state before switching
      setEmail("");
      setPassword("");
      setShowPw(false);
      setError(null);
      setMessage(null);
      setEmailReadOnly(true);
      setPwReadOnly(true);
      setMode(newMode);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        navigate("/closet", { replace: true });
      } else {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        setMessage("Account created! Check your email to confirm, then sign in.");
        setEmail("");
        setPassword("");
        setShowPw(false);
        setEmailReadOnly(true);
        setPwReadOnly(true);
        setMode("signin");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const { data, error: err } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { access_type: "offline", prompt: "consent" },
          skipBrowserRedirect: true,
        },
      });

      if (err) throw err;
      if (!data?.url) throw new Error("No authorization URL returned from Supabase.");

      // Pre-check if Google provider is enabled in Supabase to avoid 400/404 browser redirect
      try {
        const probe = await fetch(data.url, { method: "GET", redirect: "manual" });
        if (probe.status === 400 || probe.status === 404) {
          const body = await probe.json().catch(() => null);
          if (
            body?.msg?.includes("not enabled") ||
            body?.error_code === "validation_failed" ||
            probe.status === 404
          ) {
            throw new Error(
              "Google Sign-In is not enabled yet in your Supabase project (Authentication → Providers → Google). Please configure Google Client ID & Secret in Supabase, or sign in with email and password below."
            );
          }
        }
      } catch (probeErr: unknown) {
        if (
          probeErr instanceof Error &&
          probeErr.message.includes("Google Sign-In is not enabled")
        ) {
          throw probeErr;
        }
        // CORS or redirect is expected when Google is properly enabled — safe to proceed
      }

      window.location.href = data.url;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initiate Google sign in.";
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--cream)",
        padding: "24px 16px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 28,
              fontWeight: 600,
              color: "var(--espresso)",
              letterSpacing: "-0.02em",
            }}
          >
            Closet<span style={{ color: "var(--brown-soft)" }}>Muse</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--brown-muted)", marginTop: 6 }}>
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </div>
        </div>

        <div className="panel" style={{ padding: "32px 28px" }}>
          {/* Mode toggle */}
          <div
            style={{
              display: "flex",
              background: "var(--cream-dark)",
              borderRadius: "var(--r-lg)",
              padding: 4,
              marginBottom: 28,
            }}
          >
            {(["signin", "signup"] as AuthMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleModeSwitch(m)}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  borderRadius: "var(--r-md)",
                  fontSize: 13.5,
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  background: mode === m ? "var(--white)" : "transparent",
                  color: mode === m ? "var(--espresso)" : "var(--brown-muted)",
                  boxShadow: mode === m ? "var(--shadow-sm)" : "none",
                  transition: "all 0.18s ease",
                }}
              >
                {m === "signin" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          {/* Google OAuth */}
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: "100%", marginBottom: 20, gap: 10 }}
            onClick={handleGoogle}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 20,
            }}
          >
            <div style={{ flex: 1, height: 1, background: "var(--border-light)" }} />
            <span style={{ fontSize: 12, color: "var(--brown-muted)" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "var(--border-light)" }} />
          </div>

          {/*
           * Form: key={mode} forces full DOM remount on mode switch.
           * autoComplete="off" on the form is a hint to browsers.
           * Inputs use readOnly initially to prevent autofill on mount.
           */}
          <form
            key={mode}
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
            autoComplete="off"
          >
            {/* Email */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor={`cm-${mode}-email`}>Email</label>
              <div style={{ position: "relative" }}>
                <Mail
                  size={15}
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--brown-muted)",
                    pointerEvents: "none",
                  }}
                />
                <input
                  ref={emailRef}
                  id={`cm-${mode}-email`}
                  name={`cm_${mode}_em`}
                  type="email"
                  className="form-input"
                  style={{ paddingLeft: 36 }}
                  placeholder="you@example.com"
                  value={email}
                  readOnly={emailReadOnly}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setEmailReadOnly(false)}
                  onClick={() => setEmailReadOnly(false)}
                  required
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Password */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor={`cm-${mode}-pw`}>Password</label>
              <div style={{ position: "relative" }}>
                <Lock
                  size={15}
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--brown-muted)",
                    pointerEvents: "none",
                  }}
                />
                <input
                  ref={pwRef}
                  id={`cm-${mode}-pw`}
                  name={`cm_${mode}_pw`}
                  type={showPw ? "text" : "password"}
                  className="form-input"
                  style={{ paddingLeft: 36, paddingRight: 40 }}
                  placeholder={mode === "signup" ? "Min 6 characters" : "Your password"}
                  value={password}
                  readOnly={pwReadOnly}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setPwReadOnly(false)}
                  onClick={() => setPwReadOnly(false)}
                  required
                  autoComplete="new-password"
                  minLength={mode === "signup" ? 6 : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--brown-muted)",
                    padding: 2,
                  }}
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Error / success messages */}
            {error && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "10px 12px",
                  background: "var(--rose-pale)",
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--rose-light)",
                }}
              >
                <AlertCircle size={14} style={{ color: "var(--rose)", flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 13, color: "var(--espresso)" }}>{error}</span>
              </div>
            )}
            {message && (
              <div
                style={{
                  padding: "10px 12px",
                  background: "var(--gold-pale)",
                  borderRadius: "var(--r-md)",
                  fontSize: 13,
                  color: "var(--espresso)",
                  border: "1px solid var(--gold-light, var(--border))",
                }}
              >
                {message}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: "100%", marginTop: 4 }}
              disabled={loading}
              id="auth-submit-btn"
            >
              {loading ? (
                <>
                  <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                  {mode === "signin" ? "Signing in…" : "Creating account…"}
                </>
              ) : mode === "signin" ? (
                "Sign In"
              ) : (
                "Create Account"
              )}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", fontSize: 12, color: "var(--muted)", marginTop: 20 }}>
          ClosetMuse — Early Access
        </p>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
