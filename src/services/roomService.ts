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
import type { Room, RoomMemberProfile, SharedRoomItem, WardrobeItem } from "../types";

interface RoomRow {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  created_by: string;
  is_private: boolean;
  created_at: string;
  room_members?: { count: number }[];
  room_items?: { count: number }[];
}

function toRoom(row: RoomRow, myRole?: Room["my_role"]): Room {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    created_by: row.created_by,
    invite_code: row.invite_code,
    my_role: myRole,
    is_private: row.is_private,
    created_at: row.created_at,
    member_count: row.room_members?.[0]?.count ?? 1,
    item_count: row.room_items?.[0]?.count ?? 0,
  };
}

/** Rooms the signed-in user belongs to, newest first, with counts */
export async function fetchMyRooms(): Promise<Room[]> {
  const userId = await getUserId();

  const [{ data: rooms, error }, { data: memberships, error: memberError }] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, name, description, invite_code, created_by, is_private, created_at, room_members(count), room_items(count)")
      .order("created_at", { ascending: false }),
    supabase.from("room_members").select("room_id, role").eq("user_id", userId),
  ]);

  if (error) throw new Error(`Failed to load rooms: ${error.message}`);
  if (memberError) throw new Error(`Failed to load rooms: ${memberError.message}`);

  const roles = new Map((memberships ?? []).map((m) => [m.room_id as string, m.role as Room["my_role"]]));
  return ((rooms ?? []) as RoomRow[]).map((r) => toRoom(r, roles.get(r.id)));
}

export async function createRoom(name: string, description: string): Promise<Room> {
  const { data, error } = await supabase
    .rpc("create_room", { p_name: name.trim(), p_description: description.trim() || null })
    .single<RoomRow>();
  if (error) throw new Error(error.message || "Could not create the room.");
  return toRoom(data, "owner");
}

export async function joinRoom(inviteCode: string): Promise<Room> {
  const { data, error } = await supabase
    .rpc("join_room", { p_code: inviteCode })
    .single<RoomRow>();
  if (error) {
    throw new Error(
      /invalid invite code/i.test(error.message)
        ? "That invite code doesn't match any room. Check it and try again."
        : error.message || "Could not join the room."
    );
  }
  return toRoom(data);
}

export async function fetchRoomMembers(roomId: string): Promise<RoomMemberProfile[]> {
  const { data, error } = await supabase.rpc("get_room_members", { p_room: roomId });
  if (error) throw new Error(`Failed to load members: ${error.message}`);
  return (data ?? []) as RoomMemberProfile[];
}

/** Items shared into a room, newest first */
export async function fetchRoomItems(roomId: string): Promise<SharedRoomItem[]> {
  const { data, error } = await supabase
    .from("room_items")
    .select("shared_by, shared_at, wardrobe_items(*)")
    .eq("room_id", roomId)
    .order("shared_at", { ascending: false });
  if (error) throw new Error(`Failed to load shared items: ${error.message}`);

  return (data ?? [])
    .map((row) => ({
      item: row.wardrobe_items as unknown as WardrobeItem | null,
      shared_by: row.shared_by as string,
      shared_at: row.shared_at as string,
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
  if (error) throw new Error(`Failed to load your shared items: ${error.message}`);

  const wanted = new Set(itemIds);
  const existing = new Set((current ?? []).map((r) => r.item_id as string));
  const toAdd = itemIds.filter((id) => !existing.has(id));
  const toRemove = [...existing].filter((id) => !wanted.has(id));

  if (toAdd.length > 0) {
    const { error: addError } = await supabase
      .from("room_items")
      .insert(toAdd.map((item_id) => ({ room_id: roomId, item_id, shared_by: userId })));
    if (addError) throw new Error(`Could not share items: ${addError.message}`);
  }

  if (toRemove.length > 0) {
    const { error: removeError } = await supabase
      .from("room_items")
      .delete()
      .eq("room_id", roomId)
      .eq("shared_by", userId)
      .in("item_id", toRemove);
    if (removeError) throw new Error(`Could not stop sharing items: ${removeError.message}`);
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
  if (error) throw new Error(`Could not stop sharing: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("Only the person who shared an item can stop sharing it.");
  }
}
