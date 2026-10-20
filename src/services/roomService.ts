/**
 * roomService.ts
 * Rooms: private groups that members join with an invite code, and the
 * wardrobe items each member explicitly shares into them.
 *
 * Creating/joining rooms and listing members go through database functions
 * (create_room, join_room, get_room_members); everything else is plain
 * table access. Row Level Security decides what each user can see.
 */
import { supabase } from "../lib/supabase";
import { getUserId } from "./wardrobeService";
import { planShareChanges } from "../utils/shareChanges";
import type { Room, RoomMemberProfile, SharedRoomItem, WardrobeItem } from "../types";

interface RoomRow {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  created_by: string;
  is_private: boolean;
  created_at: string;
}

/** Invite codes: 8 characters from A–Z (no I, O) and 2–9 */
const INVITE_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;

export function normalizeInviteCode(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

const NOT_SET_UP =
  "Rooms isn't set up on the server yet: the Rooms database update (migration 005) hasn't been applied.";

/**
 * Turns a Supabase error into a message for the user. PGRST202/PGRST205 mean
 * the Rooms functions/tables don't exist in the database yet.
 */
function roomError(error: { code?: string; message?: string }, fallback: string): Error {
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(error.code ?? "")) {
    return new Error(NOT_SET_UP);
  }
  return new Error(error.message ? `${fallback} ${error.message}` : fallback);
}

function toRoom(
  row: RoomRow,
  myRole?: Room["my_role"],
  counts?: { members: number; items: number }
): Room {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    created_by: row.created_by,
    invite_code: row.invite_code,
    my_role: myRole,
    is_private: row.is_private,
    created_at: row.created_at,
    member_count: counts?.members ?? 1,
    item_count: counts?.items ?? 0,
  };
}

/** Rooms the signed-in user belongs to, newest first, with counts */
export async function fetchMyRooms(): Promise<Room[]> {
  const userId = await getUserId();

  // RLS limits each query to the rooms the user belongs to; counts are
  // tallied here so no PostgREST aggregate support is needed
  const [roomsRes, membersRes, itemsRes] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, name, description, invite_code, created_by, is_private, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("room_members").select("room_id, user_id, role"),
    supabase.from("room_items").select("room_id"),
  ]);

  for (const res of [roomsRes, membersRes, itemsRes]) {
    if (res.error) throw roomError(res.error, "Failed to load rooms.");
  }

  const tally = (rows: { room_id: string }[]) => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.room_id, (counts.get(r.room_id) ?? 0) + 1);
    return counts;
  };
  const members = (membersRes.data ?? []) as { room_id: string; user_id: string; role: Room["my_role"] }[];
  const memberCounts = tally(members);
  const itemCounts = tally((itemsRes.data ?? []) as { room_id: string }[]);
  const roles = new Map(members.filter((m) => m.user_id === userId).map((m) => [m.room_id, m.role]));

  return ((roomsRes.data ?? []) as RoomRow[]).map((r) =>
    toRoom(r, roles.get(r.id), {
      members: memberCounts.get(r.id) ?? 1,
      items: itemCounts.get(r.id) ?? 0,
    })
  );
}

export async function createRoom(name: string, description: string): Promise<Room> {
  const { data, error } = await supabase
    .rpc("create_room", { p_name: name.trim(), p_description: description.trim() || null })
    .single<RoomRow>();
  if (error) throw roomError(error, "Could not create the room.");
  if (!data?.id || !data.invite_code) throw new Error("The room was not created. Please try again.");
  return toRoom(data, "owner");
}

export async function joinRoom(inviteCode: string): Promise<Room> {
  const code = normalizeInviteCode(inviteCode);
  if (!INVITE_CODE_RE.test(code)) {
    throw new Error(
      "Invite codes are 8 letters and numbers, like 7KQ4-MZ2P (no I, O, 0 or 1). Check the code and try again."
    );
  }
  const { data, error } = await supabase.rpc("join_room", { p_code: code }).single<RoomRow>();
  if (error) {
    if (/invalid invite code/i.test(error.message ?? "")) {
      throw new Error(
        "That invite code doesn't match any room. It may have been mistyped, or the room no longer exists."
      );
    }
    throw roomError(error, "Could not join the room.");
  }
  if (!data?.id) throw new Error("Could not join the room. Please try again.");
  return toRoom(data);
}

export async function fetchRoomMembers(roomId: string): Promise<RoomMemberProfile[]> {
  const { data, error } = await supabase.rpc("get_room_members", { p_room: roomId });
  if (error) throw roomError(error, "Failed to load members.");
  const members = (data ?? []) as (Omit<RoomMemberProfile, "shared_count"> & { shared_count?: number })[];

  // Before migration 006 the function has no per-member count: count the
  // room's shares in the database instead (RLS limits this to the room)
  if (members.some((m) => typeof m.shared_count !== "number")) {
    const { data: shares, error: sharesError } = await supabase
      .from("room_items")
      .select("shared_by")
      .eq("room_id", roomId);
    if (sharesError) throw roomError(sharesError, "Failed to load members.");
    const counts = new Map<string, number>();
    for (const s of shares ?? []) counts.set(s.shared_by, (counts.get(s.shared_by) ?? 0) + 1);
    return members.map((m) => ({ ...m, shared_count: counts.get(m.user_id) ?? 0 }));
  }
  return members as RoomMemberProfile[];
}

/**
 * Items one member shared into one room, newest share first. Both filters run
 * in the database; RLS only returns items shared into rooms the caller is in.
 */
export async function fetchMemberSharedItems(roomId: string, memberId: string): Promise<SharedRoomItem[]> {
  const { data: shares, error } = await supabase
    .from("room_items")
    .select("item_id, shared_by, shared_at")
    .eq("room_id", roomId)
    .eq("shared_by", memberId)
    .order("shared_at", { ascending: false });
  if (error) throw roomError(error, "Failed to load this wardrobe.");
  if (!shares || shares.length === 0) return [];

  const { data: items, error: itemsError } = await supabase
    .from("wardrobe_items")
    .select("*")
    .eq("user_id", memberId)
    .in("id", shares.map((s) => s.item_id as string));
  if (itemsError) throw roomError(itemsError, "Failed to load this wardrobe.");

  const byId = new Map(((items ?? []) as WardrobeItem[]).map((i) => [i.id, i]));
  return shares
    .map((s) => ({ item: byId.get(s.item_id as string) ?? null, shared_by: s.shared_by as string, shared_at: s.shared_at as string }))
    .filter((r): r is SharedRoomItem => Boolean(r.item));
}

/** Rooms the signed-in user has shared one of their own items into */
export async function fetchItemRooms(itemId: string): Promise<{ id: string; name: string }[]> {
  const userId = await getUserId();
  const { data: shares, error } = await supabase
    .from("room_items")
    .select("room_id")
    .eq("item_id", itemId)
    .eq("shared_by", userId);
  if (error) {
    // Rooms not set up yet: the item simply isn't shared anywhere
    if (["PGRST205", "42P01"].includes(error.code ?? "")) return [];
    throw roomError(error, "Failed to load sharing details.");
  }
  if (!shares || shares.length === 0) return [];

  const { data: rooms, error: roomsError } = await supabase
    .from("rooms")
    .select("id, name")
    .in("id", shares.map((s) => s.room_id as string));
  if (roomsError) throw roomError(roomsError, "Failed to load sharing details.");
  return (rooms ?? []) as { id: string; name: string }[];
}

/** Items shared into a room, newest first */
export async function fetchRoomItems(roomId: string): Promise<SharedRoomItem[]> {
  const { data: shares, error } = await supabase
    .from("room_items")
    .select("item_id, shared_by, shared_at")
    .eq("room_id", roomId)
    .order("shared_at", { ascending: false });
  if (error) throw roomError(error, "Failed to load shared items.");
  if (!shares || shares.length === 0) return [];

  // RLS returns only items shared into rooms the user belongs to
  const { data: items, error: itemsError } = await supabase
    .from("wardrobe_items")
    .select("*")
    .in("id", shares.map((s) => s.item_id as string));
  if (itemsError) throw roomError(itemsError, "Failed to load shared items.");

  const byId = new Map(((items ?? []) as WardrobeItem[]).map((i) => [i.id, i]));
  return shares
    .map((s) => ({
      item: byId.get(s.item_id as string) ?? null,
      shared_by: s.shared_by as string,
      shared_at: s.shared_at as string,
    }))
    .filter((r): r is SharedRoomItem => Boolean(r.item));
}

/**
 * Makes the signed-in user's shared items in a room exactly `itemIds`:
 * shares the new ones and stops sharing the rest. Never touches the
 * wardrobe items themselves or anyone else's shares.
 */
export async function setMySharedItems(roomId: string, itemIds: string[]): Promise<void> {
  const userId = await getUserId();

  const { data: current, error } = await supabase
    .from("room_items")
    .select("item_id")
    .eq("room_id", roomId)
    .eq("shared_by", userId);
  if (error) throw roomError(error, "Failed to load your shared items.");

  const { toAdd, toRemove } = planShareChanges(
    (current ?? []).map((r) => r.item_id as string),
    itemIds
  );

  if (toAdd.length > 0) {
    // ON CONFLICT DO NOTHING: a share saved meanwhile (another tab, a double
    // click) is not an error; the (room_id, item_id) key prevents duplicates
    const { error: addError } = await supabase
      .from("room_items")
      .upsert(
        toAdd.map((item_id) => ({ room_id: roomId, item_id, shared_by: userId })),
        { onConflict: "room_id,item_id", ignoreDuplicates: true }
      );
    if (addError) throw roomError(addError, "Could not share items.");
  }

  if (toRemove.length > 0) {
    const { error: removeError } = await supabase
      .from("room_items")
      .delete()
      .eq("room_id", roomId)
      .eq("shared_by", userId)
      .in("item_id", toRemove);
    if (removeError) throw roomError(removeError, "Could not stop sharing items.");
  }
}

/** Stops sharing one of the signed-in user's items in a room */
export async function unshareItem(roomId: string, itemId: string): Promise<void> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("room_items")
    .delete()
    .eq("room_id", roomId)
    .eq("item_id", itemId)
    .eq("shared_by", userId)
    .select("item_id");
  if (error) throw roomError(error, "Could not stop sharing.");
  if (!data || data.length === 0) {
    throw new Error("Only the person who shared an item can stop sharing it.");
  }
}
