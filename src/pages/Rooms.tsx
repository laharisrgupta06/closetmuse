import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  Key,
  Users,
  Shirt,
  SlidersHorizontal,
  RefreshCw,
  Copy,
  Check,
  Loader2,
  Share2,
  Lock,
  AlertCircle,
} from "lucide-react";
import Navbar from "../components/Navbar";
import EmptyState from "../components/EmptyState";
import RoomCard, { RoomCardSkeleton } from "../components/RoomCard";
import WardrobeCard, { WardrobeCardSkeleton } from "../components/WardrobeCard";
import { useAuth } from "../contexts/AuthContext";
import {
  createRoom,
  fetchMyRooms,
  fetchRoomItems,
  fetchRoomMembers,
  joinRoom,
  setMySharedItems,
  unshareItem,
} from "../services/roomService";
import { fetchAllWardrobeItems } from "../services/wardrobeService";
import { getNormalizedCategory } from "../utils/category";
import type {
  Room,
  RoomMemberProfile,
  SharedRoomItem,
  WardrobeItem,
  LoadingState,
} from "../types";
import "../App.css";

type ActiveView = "rooms" | "room-detail";

const CATEGORY_FILTERS = [
  { value: "all", label: "All" },
  { value: "tops", label: "Tops" },
  { value: "bottoms", label: "Bottoms" },
  { value: "dresses", label: "Dresses" },
  { value: "outerwear", label: "Outerwear" },
  { value: "footwear", label: "Footwear" },
  { value: "bags", label: "Bags" },
  { value: "jewellery", label: "Jewellery" },
  { value: "accessories", label: "Accessories" },
];

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(28, 23, 20, 0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 200,
  padding: 20,
} as const;

function ErrorNote({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "10px 12px",
        background: "var(--rose-pale)",
        borderRadius: "var(--r-md)",
        border: "1px solid var(--rose-light)",
        fontSize: 13,
        color: "var(--espresso)",
      }}
    >
      <AlertCircle size={14} style={{ color: "var(--rose)", flexShrink: 0, marginTop: 2 }} />
      <span>{message}</span>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M1 1l12 12M13 1L1 13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Rooms() {
  const { user } = useAuth();
  const [view, setView] = useState<ActiveView>("rooms");
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [roomSearch, setRoomSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState<LoadingState>("loading");
  const [roomsError, setRoomsError] = useState<string | null>(null);

  const [roomItems, setRoomItems] = useState<SharedRoomItem[]>([]);
  const [members, setMembers] = useState<RoomMemberProfile[]>([]);
  const [itemsLoading, setItemsLoading] = useState<LoadingState>("idle");
  const [detailError, setDetailError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadRooms = useCallback(async () => {
    setRoomsLoading("loading");
    setRoomsError(null);
    try {
      setRooms(await fetchMyRooms());
      setRoomsLoading("success");
    } catch (err) {
      setRoomsError(err instanceof Error ? err.message : "Failed to load rooms.");
      setRoomsLoading("error");
    }
  }, []);

  const loadRoomDetail = useCallback(async (roomId: string) => {
    setItemsLoading("loading");
    setDetailError(null);
    try {
      const [items, people] = await Promise.all([
        fetchRoomItems(roomId),
        fetchRoomMembers(roomId),
      ]);
      setRoomItems(items);
      setMembers(people);
      setItemsLoading("success");
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Failed to load this room.");
      setItemsLoading("error");
    }
  }, []);

  // Initial load (state starts as "loading"; later reloads use loadRooms)
  useEffect(() => {
    let active = true;
    fetchMyRooms()
      .then((data) => {
        if (!active) return;
        setRooms(data);
        setRoomsLoading("success");
      })
      .catch((err) => {
        if (!active) return;
        setRoomsError(err instanceof Error ? err.message : "Failed to load rooms.");
        setRoomsLoading("error");
      });
    return () => {
      active = false;
    };
  }, []);

  const handleRoomSelect = (room: Room) => {
    setSelectedRoom(room);
    setView("room-detail");
    setRoomItems([]);
    setMembers([]);
    setItemSearch("");
    setActiveFilter("all");
    loadRoomDetail(room.id);
  };

  const handleRoomReady = (room: Room) => {
    setShowCreateModal(false);
    setShowJoinModal(false);
    loadRooms();
    handleRoomSelect(room);
  };

  const handleCopyCode = async () => {
    if (!selectedRoom?.invite_code) return;
    try {
      await navigator.clipboard.writeText(selectedRoom.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the code is visible to copy manually
    }
  };

  const handleStopSharing = async (item: WardrobeItem) => {
    if (!selectedRoom) return;
    if (!confirm(`Stop sharing "${item.name}" in ${selectedRoom.name}? It stays in your closet.`)) {
      return;
    }
    try {
      await unshareItem(selectedRoom.id, item.id);
      setRoomItems((prev) => prev.filter((r) => r.item.id !== item.id));
      loadRooms();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not stop sharing this item.");
    }
  };

  const memberName = (userId: string) => {
    if (userId === user?.id) return "You";
    return members.find((m) => m.user_id === userId)?.display_name ?? "A member";
  };

  const filteredRooms = rooms.filter((r) =>
    r.name.toLowerCase().includes(roomSearch.toLowerCase())
  );

  const filteredItems =
    activeFilter === "all"
      ? roomItems
      : roomItems.filter((r) => getNormalizedCategory(r.item) === activeFilter);

  const searchedItems = itemSearch
    ? filteredItems.filter((r) =>
        r.item.name.toLowerCase().includes(itemSearch.toLowerCase())
      )
    : filteredItems;

  const mySharedIds = roomItems
    .filter((r) => r.shared_by === user?.id)
    .map((r) => r.item.id);

  return (
    <div className="app-shell">
      <Navbar />

      <main className="page-content">
        <div className="page">
          {/* Header */}
          <div className="page-header">
            <div className="page-header-left">
              <div className="eyebrow">Shared Wardrobes</div>
              <h1 className="page-title">
                {view === "room-detail" && selectedRoom
                  ? selectedRoom.name
                  : "Rooms"}
              </h1>
            </div>

            <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
              {view === "rooms" ? (
                <>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowJoinModal(true)}
                  >
                    <Key size={13} />
                    Join Room
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowCreateModal(true)}
                  >
                    <Plus size={13} />
                    Create Room
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setView("rooms");
                      setSelectedRoom(null);
                    }}
                  >
                    Back to Rooms
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowShareModal(true)}
                    id="share-items-btn"
                  >
                    <Share2 size={13} />
                    Share items
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ── ROOMS LIST ── */}
          {view === "rooms" && (
            <>
              {/* Search */}
              <div className="filter-bar" style={{ marginBottom: 28 }}>
                <div className="filter-bar-left">
                  <div className="search-input-wrap">
                    <Search className="search-icon" size={15} />
                    <input
                      className="search-input"
                      type="search"
                      placeholder="Search rooms..."
                      value={roomSearch}
                      onChange={(e) => setRoomSearch(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {roomsLoading === "loading" ? (
                <div className="rooms-grid">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <RoomCardSkeleton key={i} />
                  ))}
                </div>
              ) : roomsLoading === "error" ? (
                <EmptyState
                  icon={Users}
                  title="Unable to load rooms"
                  description={roomsError ?? "Something went wrong. Please try again."}
                  action={
                    <button className="btn btn-secondary btn-sm" onClick={loadRooms}>
                      <RefreshCw size={13} />
                      Retry
                    </button>
                  }
                />
              ) : filteredRooms.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title={rooms.length === 0 ? "No rooms yet" : "No rooms found"}
                  description={
                    rooms.length === 0
                      ? "Create a room to share chosen pieces with friends or family, or join one with an invite code."
                      : `No rooms match "${roomSearch}".`
                  }
                  action={
                    rooms.length === 0 ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setShowJoinModal(true)}
                        >
                          <Key size={13} />
                          Join Room
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => setShowCreateModal(true)}
                        >
                          <Plus size={13} />
                          Create Room
                        </button>
                      </div>
                    ) : undefined
                  }
                />
              ) : (
                <div className="rooms-grid">
                  {filteredRooms.map((room) => (
                    <RoomCard
                      key={room.id}
                      room={room}
                      onClick={handleRoomSelect}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── ROOM DETAIL ── */}
          {view === "room-detail" && selectedRoom && (
            <div className="closet-layout">
              {/* Main: item grid */}
              <div className="closet-main">
                {/* Room meta */}
                <div
                  className="card card-sm"
                  style={{ marginBottom: 24, background: "var(--cream-dark)" }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <div className="empty-icon" style={{ width: 40, height: 40, marginBottom: 0 }}>
                      <Users size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {members.length || selectedRoom.member_count} member
                        {(members.length || selectedRoom.member_count) !== 1 ? "s" : ""}
                        {" · "}
                        {roomItems.length} shared item{roomItems.length !== 1 ? "s" : ""}
                      </div>
                      {selectedRoom.description && (
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--brown-soft)",
                            marginTop: 2,
                          }}
                        >
                          {selectedRoom.description}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {detailError && (
                  <div style={{ marginBottom: 16 }}>
                    <ErrorNote message={detailError} />
                  </div>
                )}

                {/* Filter bar */}
                <div className="filter-bar">
                  <div className="filter-bar-left">
                    <div className="search-input-wrap">
                      <Search className="search-icon" size={15} />
                      <input
                        className="search-input"
                        type="search"
                        placeholder="Search items..."
                        value={itemSearch}
                        onChange={(e) => setItemSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="filter-chips">
                    {CATEGORY_FILTERS.map((f) => (
                      <button
                        key={f.value}
                        className={`filter-chip${activeFilter === f.value ? " active" : ""}`}
                        onClick={() => setActiveFilter(f.value)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <button className="btn btn-secondary btn-sm">
                    <SlidersHorizontal size={14} />
                    Sort
                  </button>
                </div>

                {/* Items */}
                {itemsLoading === "loading" ? (
                  <div className="item-grid">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <WardrobeCardSkeleton key={i} />
                    ))}
                  </div>
                ) : searchedItems.length === 0 && roomItems.length === 0 ? (
                  <EmptyState
                    icon={Shirt}
                    title="No items shared yet"
                    description="Nothing from anyone's closet is visible here until they choose to share it."
                    action={
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowShareModal(true)}
                      >
                        <Share2 size={13} />
                        Share items
                      </button>
                    }
                  />
                ) : searchedItems.length === 0 ? (
                  <EmptyState
                    icon={Search}
                    title="No items found"
                    description={
                      itemSearch
                        ? `No items match "${itemSearch}".`
                        : "No shared items in this category."
                    }
                  />
                ) : (
                  <div className="item-grid">
                    {searchedItems.map(({ item, shared_by }) => (
                      <WardrobeCard
                        key={item.id}
                        item={item}
                        footer={
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 6,
                              marginTop: 6,
                              fontSize: 11.5,
                              color: "var(--brown-muted)",
                            }}
                          >
                            <span className="truncate">Shared by {memberName(shared_by)}</span>
                            {shared_by === user?.id && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: 11, padding: "2px 6px" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStopSharing(item);
                                }}
                              >
                                Stop sharing
                              </button>
                            )}
                          </div>
                        }
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Sidebar: Room info + requests */}
              <div className="closet-sidebar">
                <div className="panel" style={{ padding: 24 }}>
                  <div className="eyebrow" style={{ marginBottom: 14 }}>
                    Room
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontFamily: "var(--font-serif)",
                      fontWeight: 500,
                      marginBottom: 16,
                    }}
                  >
                    {selectedRoom.name}
                  </div>

                  {/* Invite code */}
                  {selectedRoom.invite_code && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, color: "var(--brown-muted)", marginBottom: 6 }}>
                        Invite code — share it with people you want in this room
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <code
                          id="room-invite-code"
                          style={{
                            flex: 1,
                            padding: "8px 12px",
                            borderRadius: "var(--r-md)",
                            background: "var(--cream-dark)",
                            border: "1px solid var(--border)",
                            fontSize: 16,
                            letterSpacing: 3,
                            textAlign: "center",
                            fontWeight: 600,
                          }}
                        >
                          {selectedRoom.invite_code}
                        </code>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={handleCopyCode}
                          aria-label="Copy invite code"
                          title="Copy invite code"
                        >
                          {copied ? <Check size={15} /> : <Copy size={15} />}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="divider" />

                  {/* Borrow requests */}
                  <div className="section-header" style={{ marginBottom: 12 }}>
                    <span className="section-title">Requests</span>
                  </div>
                  <EmptyState
                    icon={Shirt}
                    title="No requests"
                    description="Borrow requests from room members will appear here."
                  />

                  <div className="divider" />

                  {/* Members */}
                  <div className="section-header" style={{ marginBottom: 12 }}>
                    <span className="section-title">Members</span>
                  </div>
                  {members.length === 0 ? (
                    <EmptyState
                      icon={Users}
                      title={itemsLoading === "loading" ? "Loading members…" : "No member data"}
                      description="Room members will appear here."
                    />
                  ) : (
                    <ul
                      id="room-members"
                      style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}
                    >
                      {members.map((m) => (
                        <li key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            aria-hidden="true"
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: "50%",
                              background: "var(--cream-dark)",
                              border: "1px solid var(--border)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 13,
                              fontWeight: 600,
                              color: "var(--espresso)",
                              flexShrink: 0,
                            }}
                          >
                            {m.display_name.charAt(0).toUpperCase()}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div className="truncate" style={{ fontSize: 13.5, fontWeight: 600 }}>
                              {m.display_name}
                              {m.is_me ? " (you)" : ""}
                            </div>
                            <div style={{ fontSize: 11.5, color: "var(--brown-muted)", textTransform: "capitalize" }}>
                              {m.role}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── CREATE ROOM MODAL ── */}
      {showCreateModal && (
        <CreateRoomModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleRoomReady}
        />
      )}

      {/* ── JOIN ROOM MODAL ── */}
      {showJoinModal && (
        <JoinRoomModal
          onClose={() => setShowJoinModal(false)}
          onJoined={handleRoomReady}
        />
      )}

      {/* ── SHARE ITEMS MODAL ── */}
      {showShareModal && selectedRoom && (
        <ShareItemsModal
          room={selectedRoom}
          sharedIds={mySharedIds}
          onClose={() => setShowShareModal(false)}
          onSaved={() => {
            setShowShareModal(false);
            loadRoomDetail(selectedRoom.id);
            loadRooms();
          }}
        />
      )}
    </div>
  );
}

/* ─── Create Room Modal ─────────────────────────────────────── */
function CreateRoomModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (room: Room) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      onCreated(await createRoom(name, description));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the room.");
      setSaving(false);
    }
  };

  return (
    <div
      style={overlayStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="panel"
        style={{ padding: 32, width: "100%", maxWidth: 460 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <div>
            <div className="eyebrow">New</div>
            <h2
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 22,
                fontWeight: 500,
              }}
            >
              Create a Room
            </h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="room-name">
              Room Name <span style={{ color: "var(--rose)" }}>*</span>
            </label>
            <input
              id="room-name"
              className="form-input"
              placeholder="e.g. Style Collective"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="room-desc">
              Description
            </label>
            <textarea
              id="room-desc"
              className="form-textarea"
              placeholder="What's this room for?"
              value={description}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 16px",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-lg)",
              background: "var(--cream-dark)",
            }}
          >
            <Lock size={16} style={{ color: "var(--brown-soft)", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Private room</div>
              <div style={{ fontSize: 12, color: "var(--brown-soft)", marginTop: 2 }}>
                Members join with an invite code. Only items you choose to share are visible.
              </div>
            </div>
          </div>

          {error && <ErrorNote message={error} />}

          <button
            className="btn btn-primary"
            style={{ width: "100%" }}
            disabled={!name.trim() || saving}
            onClick={handleCreate}
            id="create-room-submit"
          >
            {saving ? (
              <>
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                Creating…
              </>
            ) : (
              "Create Room"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Join Room Modal ───────────────────────────────────────── */
function JoinRoomModal({
  onClose,
  onJoined,
}: {
  onClose: () => void;
  onJoined: (room: Room) => void;
}) {
  const [passcode, setPasscode] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    if (!passcode.trim() || joining) return;
    setJoining(true);
    setError(null);
    try {
      onJoined(await joinRoom(passcode));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the room.");
      setJoining(false);
    }
  };

  return (
    <div
      style={overlayStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="panel"
        style={{ padding: 32, width: "100%", maxWidth: 400 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <div>
            <div className="eyebrow">Join</div>
            <h2
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 22,
                fontWeight: 500,
              }}
            >
              Enter Invite Code
            </h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <form
          style={{ display: "flex", flexDirection: "column", gap: 18 }}
          onSubmit={(e) => {
            e.preventDefault();
            handleJoin();
          }}
        >
          <div className="form-group">
            <label className="form-label" htmlFor="passcode">
              Room Invite Code
            </label>
            <input
              id="passcode"
              className="form-input"
              placeholder="e.g. 7KQ4-MZ2P"
              value={passcode}
              maxLength={20}
              autoComplete="off"
              onChange={(e) => setPasscode(e.target.value)}
              style={{ letterSpacing: 3, textAlign: "center", textTransform: "uppercase" }}
            />
          </div>

          {error && <ErrorNote message={error} />}

          <button
            className="btn btn-primary"
            style={{ width: "100%" }}
            disabled={!passcode.trim() || joining}
            type="submit"
            id="join-room-submit"
          >
            {joining ? (
              <>
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                Joining…
              </>
            ) : (
              "Join Room"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─── Share Items Modal ─────────────────────────────────────── */
function ShareItemsModal({
  room,
  sharedIds,
  onClose,
  onSaved,
}: {
  room: Room;
  sharedIds: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(sharedIds));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchAllWardrobeItems()
      .then((data) => {
        if (!active) return;
        // Items marked "Share in Rooms" first
        setItems([...data].sort((a, b) => Number(b.is_shared) - Number(a.is_shared)));
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : "Failed to load your closet."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await setMySharedItems(room.id, [...selected]);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update shared items.");
      setSaving(false);
    }
  };

  const original = new Set(sharedIds);
  const changes =
    [...selected].filter((id) => !original.has(id)).length +
    sharedIds.filter((id) => !selected.has(id)).length;

  return (
    <div
      style={overlayStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="panel"
        style={{ padding: 28, width: "100%", maxWidth: 560, maxHeight: "86vh", display: "flex", flexDirection: "column" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <div>
            <div className="eyebrow">Share with {room.name}</div>
            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 500 }}>
              Choose items to share
            </h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--brown-soft)", marginBottom: 16 }}>
          Members of this room can see the items you tick. Everything else in your closet stays private.
          Unticking an item stops sharing it; it stays in your closet.
        </p>

        <div style={{ overflowY: "auto", flex: 1, minHeight: 120, marginBottom: 16 }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--brown-soft)" }}>
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              Loading your closet…
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Shirt}
              title="Your closet is empty"
              description="Add items to your closet first, then share them here."
            />
          ) : (
            <ul id="share-item-list" style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {items.map((item) => (
                <li key={item.id}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "8px 10px",
                      borderRadius: "var(--r-md)",
                      border: `1px solid ${selected.has(item.id) ? "var(--espresso)" : "var(--border-light)"}`,
                      background: selected.has(item.id) ? "var(--cream-dark)" : "var(--white)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggle(item.id)}
                      aria-label={`Share ${item.name}`}
                    />
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "var(--r-sm, 6px)",
                        background: "var(--cream-mid)",
                        overflow: "hidden",
                        flexShrink: 0,
                      }}
                    >
                      {item.image_url && (
                        <img
                          src={item.image_url}
                          alt=""
                          loading="lazy"
                          style={{ width: "100%", height: "100%", objectFit: "contain" }}
                        />
                      )}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="truncate" style={{ fontSize: 13.5, fontWeight: 600 }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--brown-muted)", textTransform: "capitalize" }}>
                        {item.subcategory || getNormalizedCategory(item)}
                        {item.is_shared ? " · marked shareable" : ""}
                      </div>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <div style={{ marginBottom: 12 }}>
            <ErrorNote message={error} />
          </div>
        )}

        <button
          className="btn btn-primary"
          style={{ width: "100%" }}
          disabled={saving || loading || changes === 0}
          onClick={handleSave}
          id="share-items-save"
        >
          {saving ? (
            <>
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              Saving…
            </>
          ) : changes === 0 ? (
            `${selected.size} item${selected.size !== 1 ? "s" : ""} shared`
          ) : (
            `Save (${selected.size} shared)`
          )}
        </button>
      </div>
    </div>
  );
}
