/**
 * RequireAuth.tsx
 * Wraps protected routes. Redirects to /auth if user is not signed in.
 * Shows nothing while the session is being checked (avoids flash).
 */
import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    // Show minimal loading indicator while checking session
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--cream)",
          fontFamily: "var(--font-sans)",
          color: "var(--brown-muted)",
          fontSize: 14,
        }}
      >
        Loading…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
