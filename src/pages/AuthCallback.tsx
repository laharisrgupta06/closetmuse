/**
 * AuthCallback.tsx
 * Handles Supabase OAuth redirect (e.g. Google Sign-In).
 * Exchanges the auth code/token for a user session, then redirects to /closet.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertCircle } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function handleAuth() {
      try {
        // Check for error parameters in URL (from Supabase OAuth failure)
        const params = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const errorDesc =
          params.get("error_description") ||
          hashParams.get("error_description") ||
          params.get("error") ||
          hashParams.get("error");

        if (errorDesc) {
          throw new Error(errorDesc);
        }

        // Get the current session (Supabase JS auto-exchanges PKCE code or hash token)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (session) {
          if (mounted) navigate("/closet", { replace: true });
          return;
        }

        // If not immediately available, listen for the SIGNED_IN event
        const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
          if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && newSession) {
            if (mounted) navigate("/closet", { replace: true });
          }
        });

        // Set a timeout in case no session event fires
        const timeout = setTimeout(() => {
          if (mounted) {
            supabase.auth.getSession().then(({ data }) => {
              if (data.session) {
                navigate("/closet", { replace: true });
              } else {
                navigate("/auth", { replace: true });
              }
            });
          }
        }, 4000);

        return () => {
          listener.subscription.unsubscribe();
          clearTimeout(timeout);
        };
      } catch (err: unknown) {
        if (mounted) {
          const msg = err instanceof Error ? err.message : "Authentication failed.";
          setError(msg);
        }
      }
    }

    handleAuth();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  if (error) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--cream)",
          padding: 24,
        }}
      >
        <div className="panel" style={{ maxWidth: 400, padding: 32, textAlign: "center" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "var(--rose-pale)",
              color: "var(--rose)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <AlertCircle size={24} />
          </div>
          <h3 style={{ marginBottom: 8, color: "var(--espresso)" }}>Sign-in Issue</h3>
          <p style={{ fontSize: 13, color: "var(--brown-muted)", marginBottom: 20 }}>
            {error}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: "100%" }}
            onClick={() => navigate("/auth", { replace: true })}
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--cream)",
        gap: 16,
      }}
    >
      <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: "var(--brown-soft)" }} />
      <div style={{ fontSize: 14, color: "var(--brown-muted)" }}>
        Completing sign in…
      </div>
    </div>
  );
}
