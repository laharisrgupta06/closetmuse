/**
 * notificationService.ts
 * The signed-in user's notifications (migration 010). Rows are created only
 * by database triggers; the app can read its own and mark them as read.
 */
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { getUserId } from "./wardrobeService";
import type { AppNotification } from "../utils/notificationText";

/** Thrown when the notifications table/function doesn't exist yet (before 010) */
export class NotificationsUnavailableError extends Error {}

const MISSING = ["PGRST202", "PGRST205", "42P01", "42883"];

function wrap(error: { code?: string; message: string }, fallback: string): Error {
  if (MISSING.includes(error.code ?? "")) {
    return new NotificationsUnavailableError("Notifications aren't set up on the server yet (database update 010).");
  }
  return new Error(`${fallback} ${error.message}`.trim());
}

/** Newest first, with names, room, item and previews resolved by the database */
export async function fetchNotifications(limit = 50): Promise<AppNotification[]> {
  const { data, error } = await supabase.rpc("get_my_notifications", { p_limit: limit });
  if (error) throw wrap(error, "Couldn't load notifications.");
  return (data ?? []) as AppNotification[];
}

export async function fetchUnreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw wrap(error, "Couldn't load notifications.");
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  if (error) throw wrap(error, "Couldn't update the notification.");
}

export async function markAllNotificationsRead(): Promise<void> {
  const userId = await getUserId();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .is("read_at", null);
  if (error) throw wrap(error, "Couldn't update notifications.");
}

/** Chat notifications for a room you're looking at are read by being there */
export async function markRoomMessagesRead(roomId: string): Promise<void> {
  const userId = await getUserId();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .eq("room_id", roomId)
    .eq("type", "room_message")
    .is("read_at", null);
  if (error && !MISSING.includes(error.code ?? "")) throw wrap(error, "Couldn't update notifications.");
  notifyNotificationsChanged();
}

/**
 * Calls onChange whenever one of the user's notifications is added or
 * updated (Supabase Realtime, filtered to this user and checked by RLS).
 * onStatus reports whether the live connection works, so the caller can
 * fall back to occasional polling.
 */
export function subscribeToNotifications(
  userId: string,
  onChange: () => void,
  onStatus: (live: boolean) => void
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`notifications-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
      () => onChange()
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") onStatus(true);
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") onStatus(false);
    });
  return () => {
    supabase.removeChannel(channel);
  };
}

// In-app signal so the bell refreshes right after the user reads something
// elsewhere (e.g. by opening a room's chat), without waiting for Realtime.
const CHANGED = "closetmuse:notifications-changed";

export function notifyNotificationsChanged(): void {
  window.dispatchEvent(new Event(CHANGED));
}

export function onNotificationsChanged(handler: () => void): () => void {
  window.addEventListener(CHANGED, handler);
  return () => window.removeEventListener(CHANGED, handler);
}
