/**
 * borrowService.ts
 * Borrow requests between Room members. Requests are created and answered
 * through database functions (request_borrow, respond_borrow_request,
 * cancel_borrow_request) that check membership, sharing and ownership;
 * RLS lets only the requester and the owner read a request.
 */
import { supabase } from "../lib/supabase";
import { getUserId } from "./wardrobeService";
import type { BorrowRequest, WardrobeItem } from "../types";

export interface BorrowRequestView extends BorrowRequest {
  /** The item, when the viewer can still see it (null if it was unshared) */
  item: WardrobeItem | null;
  direction: "incoming" | "outgoing";
}

const NOT_SET_UP =
  "Borrow requests aren't set up on the server yet: the database update (migration 006) hasn't been applied.";

function borrowError(error: { code?: string; message?: string }, fallback: string): Error {
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(error.code ?? "")) return new Error(NOT_SET_UP);
  return new Error(error.message || fallback);
}

export async function requestBorrow(roomId: string, itemId: string, message: string): Promise<BorrowRequest> {
  const { data, error } = await supabase
    .rpc("request_borrow", { p_room: roomId, p_item: itemId, p_message: message.trim() || null })
    .single<BorrowRequest>();
  if (error) throw borrowError(error, "Could not send the request.");
  if (!data?.id) throw new Error("The request was not saved. Please try again.");
  return data;
}

/**
 * Accepts or declines a request, optionally with a reply. The status and the
 * reply are saved together by one database function call.
 */
let repliesColumn: Promise<boolean> | null = null;

/**
 * Whether owners can attach a reply (migration 007 adds
 * borrow_requests.response_message and the p_response argument together).
 * Checked once per page load with a read that returns no rows.
 */
export function hasBorrowReplies(): Promise<boolean> {
  repliesColumn ??= (async () => {
    const { error } = await supabase.from("borrow_requests").select("response_message").limit(0);
    if (!error) return true;
    if (error.code === "42703" || error.code === "PGRST204") return false;
    repliesColumn = null; // network or auth problem: try again next time
    return false;
  })();
  return repliesColumn;
}

export async function respondToBorrow(
  requestId: string,
  accept: boolean,
  reply?: string
): Promise<BorrowRequest> {
  const text = reply?.trim() ?? "";
  if (text.length > 500) throw new Error("Replies can be up to 500 characters.");
  const args = text
    ? { p_request: requestId, p_accept: accept, p_response: text }
    : { p_request: requestId, p_accept: accept };
  const { data, error } = await supabase
    .rpc("respond_borrow_request", args)
    .single<BorrowRequest>();
  if (error) {
    // Before migration 007 the function has no reply argument
    if (text && error.code === "PGRST202") {
      throw new Error(
        "Replies can't be saved yet: the database update (migration 007) hasn't been applied. You can still answer without a message."
      );
    }
    throw borrowError(error, "Could not update the request.");
  }
  return data;
}

export async function cancelBorrow(requestId: string): Promise<BorrowRequest> {
  const { data, error } = await supabase
    .rpc("cancel_borrow_request", { p_request: requestId })
    .single<BorrowRequest>();
  if (error) throw borrowError(error, "Could not cancel the request.");
  return data;
}

/** Requests in a room that involve the signed-in user, newest first */
export async function fetchRoomBorrowRequests(roomId: string): Promise<BorrowRequestView[]> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("borrow_requests")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false });
  if (error) throw borrowError(error, "Failed to load borrow requests.");
  const requests = (data ?? []) as BorrowRequest[];
  if (requests.length === 0) return [];

  const { data: items, error: itemsError } = await supabase
    .from("wardrobe_items")
    .select("*")
    .in("id", [...new Set(requests.map((r) => r.item_id))]);
  if (itemsError) throw borrowError(itemsError, "Failed to load borrow requests.");
  const byId = new Map(((items ?? []) as WardrobeItem[]).map((i) => [i.id, i]));

  return requests.map((r) => ({
    ...r,
    item: byId.get(r.item_id) ?? null,
    direction: r.owner_id === userId ? "incoming" : "outgoing",
  }));
}

/** The signed-in user's own requests for one item in a room, newest first */
export async function fetchMyRequestsForItem(roomId: string, itemId: string): Promise<BorrowRequest[]> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("borrow_requests")
    .select("*")
    .eq("room_id", roomId)
    .eq("item_id", itemId)
    .eq("requester_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw borrowError(error, "Failed to load your requests.");
  return (data ?? []) as BorrowRequest[];
}
