/**
 * chatService.ts
 * Room chat backed by public.room_messages. RLS limits reading and sending
 * to room members. New messages arrive through Supabase Realtime; if the
 * live connection fails, the caller falls back to polling.
 */
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { RoomMessage } from "../types";

const PAGE = 200;
export const MAX_MESSAGE_LENGTH = 2000;

function chatError(error: { code?: string; message?: string }, fallback: string): Error {
  if (["PGRST205", "42P01"].includes(error.code ?? "")) {
    return new Error("Room chat isn't set up on the server yet: the database update (migration 006) hasn't been applied.");
  }
  return new Error(error.message ? `${fallback} ${error.message}` : fallback);
}

/** The latest messages, oldest first */
export async function fetchMessages(roomId: string): Promise<RoomMessage[]> {
  const { data, error } = await supabase
    .from("room_messages")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(PAGE);
  if (error) throw chatError(error, "Failed to load messages.");
  return ((data ?? []) as RoomMessage[]).reverse();
}

export async function sendMessage(roomId: string, body: string): Promise<RoomMessage> {
  const text = body.trim();
  if (!text) throw new Error("Type a message first.");
  if (text.length > MAX_MESSAGE_LENGTH) throw new Error(`Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`);
  const { data, error } = await supabase
    .from("room_messages")
    .insert({ room_id: roomId, body: text })
    .select("*")
    .single<RoomMessage>();
  if (error) throw chatError(error, "Message not sent.");
  return data;
}

/**
 * Calls onMessage for each new message in the room. onStatus reports whether
 * the live connection works, so the caller can poll when it doesn't.
 */
export function subscribeToRoom(
  roomId: string,
  onMessage: (message: RoomMessage) => void,
  onStatus: (live: boolean) => void
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`room-messages-${roomId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "room_messages", filter: `room_id=eq.${roomId}` },
      (payload) => onMessage(payload.new as RoomMessage)
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") onStatus(true);
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") onStatus(false);
    });
  return () => {
    supabase.removeChannel(channel);
  };
}
