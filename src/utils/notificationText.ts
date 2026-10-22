// Wording, grouping and destinations for notification-centre entries.
// Pure functions so they can be unit tested.
import { formatItemNumber } from "./numbering.ts";

export type NotificationType =
  | "room_message"
  | "borrow_requested"
  | "borrow_accepted"
  | "borrow_declined"
  | "borrow_cancelled";

export interface AppNotification {
  id: string;
  type: NotificationType;
  created_at: string;
  read_at: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_avatar_url: string | null;
  room_id: string | null;
  room_name: string | null;
  message_id: string | null;
  message_preview: string | null;
  request_id: string | null;
  request_status: string | null;
  response_message: string | null;
  item_id: string | null;
  item_name: string | null;
  item_number: number | null;
}

export type NotificationFilter = "all" | "messages" | "borrow";

export function notificationGroup(n: Pick<AppNotification, "type">): Exclude<NotificationFilter, "all"> {
  return n.type === "room_message" ? "messages" : "borrow";
}

const TITLES: Record<NotificationType, string> = {
  room_message: "New message",
  borrow_requested: "New borrow request",
  borrow_accepted: "Request accepted",
  borrow_declined: "Request declined",
  borrow_cancelled: "Request withdrawn",
};

export function notificationTitle(n: Pick<AppNotification, "type">): string {
  return TITLES[n.type] ?? "Notification";
}

/** "the Black Dress (#012)", or "an item" when it no longer exists */
function itemLabel(n: Pick<AppNotification, "item_name" | "item_number">, article = "the"): string {
  if (!n.item_name) return "an item";
  const num = formatItemNumber(n.item_number);
  return `${article ? article + " " : ""}${n.item_name}${num ? ` (${num})` : ""}`;
}

/** The sentence under the title */
export function notificationText(n: AppNotification): string {
  const who = n.actor_name ?? "Someone";
  switch (n.type) {
    case "room_message":
      return n.room_name ? `${who} sent a message in ${n.room_name}.` : `${who} sent a message in a room you're no longer in.`;
    case "borrow_requested":
      return `${who} wants to borrow ${n.item_name ? "your " + itemLabel(n, "") : "one of your items"}.`;
    case "borrow_accepted":
      return `${who} accepted your request for ${itemLabel(n)}.`;
    case "borrow_declined":
      return `${who} declined your request for ${itemLabel(n)}.`;
    case "borrow_cancelled":
      return `${who} withdrew their request for ${n.item_name ? "your " + itemLabel(n, "") : "an item"}.`;
    default:
      return "";
  }
}

/** A quoted extra line: message preview, or the owner's reply */
export function notificationQuote(n: AppNotification): string | null {
  if (n.type === "room_message") return n.message_preview;
  if (n.type === "borrow_accepted" || n.type === "borrow_declined") return n.response_message;
  return null;
}

export interface NotificationDestination {
  path: "/rooms";
  state: { roomId: string; view: "chat" | "requests"; tab?: "incoming" | "outgoing"; requestId?: string | null };
}

/** Where clicking an entry should go, or null when the room no longer exists */
export function notificationDestination(n: AppNotification): NotificationDestination | null {
  if (!n.room_id) return null;
  if (n.type === "room_message") return { path: "/rooms", state: { roomId: n.room_id, view: "chat" } };
  const tab = n.type === "borrow_requested" || n.type === "borrow_cancelled" ? "incoming" : "outgoing";
  return { path: "/rooms", state: { roomId: n.room_id, view: "requests", tab, requestId: n.request_id } };
}

/** "Just now", "5m ago", "3h ago", "Yesterday", "4d ago", then a date */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const s = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (s < 60) return "Just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d}d ago`;
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(then.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

/** Badge text: nothing for zero, "9+" for large counts */
export function badgeText(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 9 ? "9+" : String(count);
}
