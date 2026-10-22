import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, MessageCircle, Repeat2, Check, X, AlertCircle, Loader2, CheckCheck } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationsUnavailableError,
  onNotificationsChanged,
  subscribeToNotifications,
} from "../services/notificationService";
import {
  badgeText,
  notificationDestination,
  notificationGroup,
  notificationQuote,
  notificationText,
  notificationTitle,
  relativeTime,
} from "../utils/notificationText";
import type { AppNotification, NotificationFilter } from "../utils/notificationText";

/** Only used when the live connection is down */
const FALLBACK_POLL_MS = 60_000;

const FILTERS: { value: NotificationFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "messages", label: "Messages" },
  { value: "borrow", label: "Borrow requests" },
];

function TypeIcon({ n }: { n: AppNotification }) {
  if (n.type === "room_message") return <MessageCircle size={14} />;
  if (n.type === "borrow_accepted") return <Check size={14} />;
  if (n.type === "borrow_declined") return <X size={14} />;
  return <Repeat2 size={14} />;
}

/** Bell with unread badge and a panel listing the user's notifications */
export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error" | "unavailable">("idle");
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [notice, setNotice] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const refreshCount = useCallback(async () => {
    try {
      setUnread(await fetchUnreadCount());
    } catch (e) {
      if (e instanceof NotificationsUnavailableError) setState("unavailable");
    }
  }, []);

  const refreshList = useCallback(async (quiet = false) => {
    if (!quiet) setState("loading");
    setError(null);
    try {
      const list = await fetchNotifications();
      setItems(list);
      setUnread(list.filter((n) => !n.read_at).length);
      setState("idle");
    } catch (e) {
      if (e instanceof NotificationsUnavailableError) setState("unavailable");
      else {
        setError(e instanceof Error ? e.message : "Couldn't load notifications.");
        setState("error");
      }
    }
  }, []);

  const refresh = useCallback(() => {
    if (openRef.current) refreshList(true);
    else refreshCount();
  }, [refreshCount, refreshList]);

  // Initial count, live updates, and refresh when the user comes back to the tab
  useEffect(() => {
    if (!user?.id) return;
    fetchUnreadCount()
      .then(setUnread)
      .catch((e) => e instanceof NotificationsUnavailableError && setState("unavailable"));
    const unsubscribe = subscribeToNotifications(user.id, refresh, setLive);
    const offChanged = onNotificationsChanged(refresh);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unsubscribe();
      offChanged();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id, refresh, refreshCount]);

  // Occasional check only while the live connection is down
  useEffect(() => {
    if (live || !user?.id) return;
    const timer = setInterval(refresh, FALLBACK_POLL_MS);
    return () => clearInterval(timer);
  }, [live, user?.id, refresh]);

  // Close on outside click or Escape (focus returns to the bell)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    setNotice(null);
    if (next) refreshList(items !== null);
  };

  const openNotification = async (n: AppNotification) => {
    if (!n.read_at) {
      // Optimistic: the badge drops at once; a failure is corrected on the next refresh
      setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)) ?? prev);
      setUnread((c) => Math.max(0, c - 1));
      markNotificationRead(n.id).catch(() => refreshList(true));
    }
    const dest = notificationDestination(n);
    if (!dest) {
      setNotice("That room is no longer available.");
      return;
    }
    setOpen(false);
    navigate(dest.path, { state: { openRoom: dest.state } });
  };

  const markAll = async () => {
    const prev = items;
    setItems((list) => list?.map((x) => (x.read_at ? x : { ...x, read_at: new Date().toISOString() })) ?? list);
    setUnread(0);
    try {
      await markAllNotificationsRead();
    } catch (e) {
      setItems(prev);
      setError(e instanceof Error ? e.message : "Couldn't update notifications.");
      refreshCount();
    }
  };

  const shown = (items ?? []).filter((n) => filter === "all" || notificationGroup(n) === filter);
  const badge = state === "unavailable" ? null : badgeText(unread);

  return (
    <div className="notif" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`icon-btn notif-bell${open ? " active" : ""}`}
        aria-label={badge ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="notif-panel"
        id="notif-bell"
        onClick={toggle}
      >
        <Bell size={16} />
        {badge && (
          <span className="notif-badge" aria-hidden="true">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-panel" id="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <div>
              <h2 className="notif-title">Notifications</h2>
              {unread > 0 && state !== "unavailable" && <span className="notif-unread">{unread} unread</span>}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm notif-mark-all"
              onClick={markAll}
              disabled={unread === 0 || state === "unavailable"}
              id="notif-mark-all"
            >
              <CheckCheck size={13} /> Mark all as read
            </button>
          </div>

          <div className="notif-filters" role="group" aria-label="Show">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`filter-chip filter-chip-sm${filter === f.value ? " active" : ""}`}
                aria-pressed={filter === f.value}
                data-notif-filter={f.value}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {notice && (
            <div className="notif-notice" role="status">
              <AlertCircle size={13} /> {notice}
            </div>
          )}

          <div className="notif-body">
            {state === "unavailable" ? (
              <p className="notif-empty">Notifications will appear here once the database update (010) is applied.</p>
            ) : state === "loading" && items === null ? (
              <p className="notif-empty">
                <Loader2 size={14} className="spin" /> Loading…
              </p>
            ) : state === "error" ? (
              <div className="notif-empty" role="alert">
                <p>{error}</p>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => refreshList()}>
                  Try again
                </button>
              </div>
            ) : shown.length === 0 ? (
              <p className="notif-empty">
                {filter === "all" ? "You’re all caught up." : filter === "messages" ? "No messages yet." : "No borrow activity yet."}
              </p>
            ) : (
              <ul className="notif-list">
                {shown.map((n) => {
                  const quote = notificationQuote(n);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        className={`notif-item${n.read_at ? "" : " unread"}`}
                        onClick={() => openNotification(n)}
                        data-notif-id={n.id}
                        data-notif-type={n.type}
                      >
                        <span className={`notif-icon notif-icon--${n.type}`} aria-hidden="true">
                          <TypeIcon n={n} />
                        </span>
                        <span className="notif-content">
                          <span className="notif-item-title">{notificationTitle(n)}</span>
                          <span className="notif-text">{notificationText(n)}</span>
                          {quote && <span className="notif-quote">“{quote}”</span>}
                          <span className="notif-time">{relativeTime(n.created_at)}</span>
                        </span>
                        {!n.read_at && (
                          <span className="notif-unread-dot">
                            <span className="sr-only">Unread</span>
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
