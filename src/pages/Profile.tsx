/**
 * Profile.tsx
 * Shows the current user's account info and provides functional settings:
 * - Editable and persistable display name
 * - Toggleable and persistable borrow request notification setting
 * - Full Privacy Policy and Terms & Conditions viewer
 * - Working Sign Out
 */
import { useState, useEffect } from "react";
import {
  UserRound,
  Mail,
  Bell,
  Shield,
  LogOut,
  ChevronRight,
  Edit2,
  Check,
  X,
  Loader2,
  Calendar,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import "../App.css";

export default function Profile() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState<string>(
    user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? ""
  );
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(displayName);
  const [savingName, setSavingName] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);

  const [notifyBorrow, setNotifyBorrow] = useState<boolean>(() => {
    const saved = user?.user_metadata?.notify_borrow_requests;
    return saved !== undefined ? Boolean(saved) : true;
  });
  const [savingNotify, setSavingNotify] = useState(false);

  const [modalContent, setModalContent] = useState<"privacy" | "terms" | null>(null);

  useEffect(() => {
    if (user?.user_metadata?.full_name || user?.user_metadata?.name) {
      const name = user.user_metadata.full_name ?? user.user_metadata.name;
      setDisplayName(name);
      if (!isEditingName) setNameInput(name);
    }
    if (user?.user_metadata?.notify_borrow_requests !== undefined) {
      setNotifyBorrow(Boolean(user.user_metadata.notify_borrow_requests));
    }
  }, [user, isEditingName]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setSavingName(true);
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: { full_name: trimmed },
      });
      if (error) throw error;
      if (data.user) {
        setDisplayName(trimmed);
        setNameSuccess(true);
        setIsEditingName(false);
        setTimeout(() => setNameSuccess(false), 2400);
      }
    } catch (err) {
      console.error("Failed to update display name:", err);
    } finally {
      setSavingName(false);
    }
  };

  const handleToggleBorrow = async () => {
    const nextVal = !notifyBorrow;
    setNotifyBorrow(nextVal);
    setSavingNotify(true);
    try {
      await supabase.auth.updateUser({
        data: { notify_borrow_requests: nextVal },
      });
    } catch (err) {
      console.error("Failed to update notification setting:", err);
      setNotifyBorrow(!nextVal); // revert
    } finally {
      setSavingNotify(false);
    }
  };

  const avatarUrl = user?.user_metadata?.avatar_url ?? null;
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div className="app-shell">
      <Navbar />

      <main className="page-content">
        <div className="page" style={{ maxWidth: 640 }}>
          {/* Header */}
          <div className="page-header">
            <div className="page-header-left">
              <div className="eyebrow">Account</div>
              <h1 className="page-title">Profile</h1>
            </div>
          </div>

          {/* Avatar + name */}
          <div
            className="card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              marginBottom: 28,
            }}
          >
            <div className="avatar avatar-lg">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profile"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: "50%",
                  }}
                />
              ) : (
                <UserRound size={28} />
              )}
            </div>
            <div>
              <div
                style={{
                  fontSize: 19,
                  fontFamily: "var(--font-serif)",
                  fontWeight: 500,
                  color: "var(--espresso)",
                  marginBottom: 4,
                }}
              >
                {displayName || "Your Profile"}
              </div>
              <div style={{ fontSize: 13, color: "var(--brown-muted)" }}>
                {user?.email ?? "Not signed in"}
              </div>
            </div>
          </div>

          {/* Account section */}
          <div className="section">
            <div className="section-header" style={{ marginBottom: 10 }}>
              <span className="eyebrow" style={{ marginBottom: 0 }}>
                Account Information
              </span>
            </div>
            <div className="panel">
              {/* Email */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 20px",
                }}
              >
                <Mail size={16} style={{ color: "var(--brown-muted)", flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>
                  Email address
                </span>
                <span style={{ fontSize: 13, color: "var(--brown-muted)" }}>
                  {user?.email ?? "—"}
                </span>
              </div>

              <div
                style={{
                  height: 1,
                  background: "var(--border-light)",
                  margin: "0 20px",
                }}
              />

              {/* Display Name (Editable) */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 20px",
                }}
              >
                <UserRound size={16} style={{ color: "var(--brown-muted)", flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>
                  Display name
                </span>
                {isEditingName ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="text"
                      className="form-input"
                      style={{
                        padding: "4px 8px",
                        fontSize: 13,
                        height: 32,
                        width: 160,
                      }}
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveName();
                        if (e.key === "Escape") {
                          setIsEditingName(false);
                          setNameInput(displayName);
                        }
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      style={{ padding: "4px 8px", height: 32 }}
                      disabled={savingName || !nameInput.trim()}
                      onClick={handleSaveName}
                      title="Save name"
                    >
                      {savingName ? (
                        <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                      ) : (
                        <Check size={13} />
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: "4px 8px", height: 32 }}
                      onClick={() => {
                        setIsEditingName(false);
                        setNameInput(displayName);
                      }}
                      title="Cancel"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, color: "var(--brown-muted)" }}>
                      {displayName || "Not set"}
                    </span>
                    {nameSuccess && (
                      <span style={{ fontSize: 12, color: "var(--green, #4a7c59)" }}>
                        Saved!
                      </span>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: "4px 8px", height: 28, fontSize: 12 }}
                      onClick={() => {
                        setNameInput(displayName);
                        setIsEditingName(true);
                      }}
                      aria-label="Edit display name"
                    >
                      <Edit2 size={12} />
                      Edit
                    </button>
                  </div>
                )}
              </div>

              {/* Member Since */}
              {memberSince && (
                <>
                  <div
                    style={{
                      height: 1,
                      background: "var(--border-light)",
                      margin: "0 20px",
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "14px 20px",
                    }}
                  >
                    <Calendar size={16} style={{ color: "var(--brown-muted)", flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>
                      Member since
                    </span>
                    <span style={{ fontSize: 13, color: "var(--brown-muted)" }}>
                      {memberSince}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Notifications */}
          <div className="section" style={{ marginTop: 28 }}>
            <div className="section-header" style={{ marginBottom: 10 }}>
              <span className="eyebrow" style={{ marginBottom: 0 }}>
                Notifications
              </span>
            </div>
            <div className="panel">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 20px",
                  cursor: "pointer",
                }}
                onClick={handleToggleBorrow}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleToggleBorrow();
                  }
                }}
                aria-label="Toggle borrow request notifications"
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <Bell size={16} style={{ color: "var(--brown-muted)", flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 500 }}>
                    Borrow requests
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {savingNotify && (
                    <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                  )}
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: notifyBorrow ? "var(--espresso)" : "var(--brown-muted)",
                    }}
                  >
                    {notifyBorrow ? "On" : "Off"}
                  </span>
                  <div
                    style={{
                      width: 36,
                      height: 20,
                      borderRadius: 12,
                      background: notifyBorrow ? "var(--espresso)" : "var(--cream-dark)",
                      position: "relative",
                      transition: "background 0.2s ease",
                      border: "1px solid var(--border-light)",
                    }}
                  >
                    <div
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        background: "var(--white)",
                        position: "absolute",
                        top: 2,
                        left: notifyBorrow ? 18 : 2,
                        transition: "left 0.2s ease",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Privacy & Legal */}
          <div className="section" style={{ marginTop: 28 }}>
            <div className="section-header" style={{ marginBottom: 10 }}>
              <span className="eyebrow" style={{ marginBottom: 0 }}>
                Privacy &amp; Terms
              </span>
            </div>
            <div className="panel">
              <button
                type="button"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 20px",
                  width: "100%",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onClick={() => setModalContent("privacy")}
              >
                <Shield size={16} style={{ color: "var(--brown-muted)", flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>
                  Privacy Policy
                </span>
                <ChevronRight size={15} style={{ color: "var(--muted)" }} />
              </button>
              <div
                style={{
                  height: 1,
                  background: "var(--border-light)",
                  margin: "0 20px",
                }}
              />
              <button
                type="button"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 20px",
                  width: "100%",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onClick={() => setModalContent("terms")}
              >
                <Shield size={16} style={{ color: "var(--brown-muted)", flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>
                  Terms &amp; Conditions
                </span>
                <ChevronRight size={15} style={{ color: "var(--muted)" }} />
              </button>
            </div>
          </div>

          {/* Sign out */}
          <div className="section" style={{ marginTop: 28 }}>
            <div className="panel">
              <button
                type="button"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 20px",
                  width: "100%",
                  cursor: "pointer",
                  background: "none",
                  border: "none",
                  color: "var(--rose)",
                }}
                onClick={handleSignOut}
                id="sign-out-btn"
              >
                <LogOut size={16} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 600 }}>Sign Out</span>
              </button>
            </div>
          </div>

          {/* App version note */}
          <p
            style={{
              fontSize: 12,
              color: "var(--muted)",
              textAlign: "center",
              marginTop: 32,
            }}
          >
            ClosetMuse &mdash; Early Access
          </p>
        </div>
      </main>

      {/* Modal for Privacy Policy / Terms & Conditions */}
      {modalContent && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(35, 27, 24, 0.45)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setModalContent(null)}
        >
          <div
            className="panel"
            style={{
              maxWidth: 580,
              width: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
              padding: "28px 24px",
              position: "relative",
              background: "var(--white)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <h2
                style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: 20,
                  color: "var(--espresso)",
                }}
              >
                {modalContent === "privacy" ? "Privacy Policy" : "Terms & Conditions"}
              </h2>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setModalContent(null)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {modalContent === "privacy" ? (
              <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--espresso)" }}>
                <p>
                  <strong>Effective Date:</strong> October 2026
                </p>
                <p>
                  At <strong>ClosetMuse</strong>, your privacy is paramount. This Privacy
                  Policy outlines how your digital wardrobe data and personal information
                  are handled.
                </p>
                <h4 style={{ margin: "14px 0 6px" }}>1. Wardrobe &amp; Image Data</h4>
                <p>
                  Photos of your clothing and fashion items uploaded to ClosetMuse are
                  stored securely in private, isolated storage scoped to your account.
                  Images are analyzed exclusively to categorize garments and generate
                  tailored styling recommendations.
                </p>
                <h4 style={{ margin: "14px 0 6px" }}>2. AI Processing</h4>
                <p>
                  Garment categorization and outfit styling utilize Google Gemini
                  infrastructure. Your data is never sold to third parties or used for
                  targeted advertising.
                </p>
                <h4 style={{ margin: "14px 0 6px" }}>3. Data Control</h4>
                <p>
                  You retain full ownership of your wardrobe inventory and images. You may
                  delete individual items or request full account deletion at any time.
                </p>
              </div>
            ) : (
              <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--espresso)" }}>
                <p>
                  <strong>Effective Date:</strong> October 2026
                </p>
                <p>
                  Welcome to <strong>ClosetMuse</strong>. By accessing or using our
                  digital wardrobe and AI styling application, you agree to these Terms.
                </p>
                <h4 style={{ margin: "14px 0 6px" }}>1. Account Registration</h4>
                <p>
                  You must maintain the security of your authentication credentials. You
                  are responsible for all activity conducted through your authenticated
                  session.
                </p>
                <h4 style={{ margin: "14px 0 6px" }}>2. Wardrobe Ingestion &amp; Use</h4>
                <p>
                  You agree to upload only fashion items and imagery that you own or are
                  authorized to catalogue. Inappropriate, offensive, or non-clothing
                  content is strictly prohibited.
                </p>
                <h4 style={{ margin: "14px 0 6px" }}>3. AI Styling Disclaimer</h4>
                <p>
                  AI Stylist outfit recommendations and styling suggestions are provided
                  for personal inspiration and cataloguing convenience.
                </p>
              </div>
            )}

            <div style={{ marginTop: 24, textAlign: "right" }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setModalContent(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
