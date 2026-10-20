import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  Key,
  Users,
  RefreshCw,
  Check,
  Loader2,
  Share2,
  Lock,
  AlertCircle,
  ChevronLeft,
  Shirt,
} from "lucide-react";
import Navbar from "../components/Navbar";
import EmptyState from "../components/EmptyState";
import RoomCard, { RoomCardSkeleton } from "../components/RoomCard";
import RoomOverview from "../components/rooms/RoomOverview";
import MemberWardrobe from "../components/rooms/MemberWardrobe";
import RoomChat from "../components/rooms/RoomChat";
import BorrowRequests from "../components/rooms/BorrowRequests";
import { useAuth } from "../contexts/AuthContext";
import {
  createRoom,
  fetchMemberSharedItems,
  fetchMyRooms,
  fetchRoomMembers,
  joinRoom,
  setMySharedItems,
} from "../services/roomService";
import { fetchAllWardrobeItems } from "../services/wardrobeService";
import { getNormalizedCategory } from "../utils/category";
import type { Room, RoomMemberProfile, WardrobeItem, LoadingState } from "../types";
import "../App.css";

/** Where the user is inside a room */
type RoomView =
  | { kind: "overview" }
  | { kind: "member"; memberId: string }
  | { kind: "chat" }
  | { kind: "requests" };

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
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [roomView, setRoomView] = useState<RoomView>({ kind: "overview" });
  const [roomSearch, setRoomSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState<LoadingState>("loading");
  const [roomsError, setRoomsError] = useState<string | null>(null);

  const [members, setMembers] = useState<RoomMemberProfile[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Bumped after sharing changes so an open member wardrobe reloads
  const [shareVersion, setShareVersion] = useState(0);

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

  const loadMembers = useCallback(async (roomId: string) => {
    setMembersLoading(true);
    setDetailError(null);
    try {
      setMembers(await fetchRoomMembers(roomId));
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Failed to load this room.");
    } finally {
      setMembersLoading(false);
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

  const openRoom = (room: Room) => {
    setSelectedRoom(room);
    setRoomView({ kind: "overview" });
    setMembers([]);
    setNotice(null);
    loadMembers(room.id);
  };

  const closeRoom = () => {
    setSelectedRoom(null);
    setRoomView({ kind: "overview" });
    setNotice(null);
    loadRooms();
  };

  const handleRoomReady = (room: Room, how: "created" | "joined") => {
    setShowCreateModal(false);
    setShowJoinModal(false);
    loadRooms();
    openRoom(room);
    setNotice(
      how === "created"
        ? `Room created. Share the invite code ${room.invite_code} so others can join.`
        : `You joined ${room.name}.`
    );
  };

  const refreshSharing = () => {
    if (!selectedRoom) return;
    loadMembers(selectedRoom.id);
    setShareVersion((v) => v + 1);
  };

  const filteredRooms = rooms.filter((r) =>
    r.name.toLowerCase().includes(roomSearch.toLowerCase())
  );

  const viewedMember =
    roomView.kind === "member" ? members.find((m) => m.user_id === roomView.memberId) : undefined;
  const subTitle =
    roomView.kind === "member"
      ? viewedMember ? (viewedMember.is_me ? "Your wardrobe" : `${viewedMember.display_name}'s wardrobe`) : "Wardrobe"
      : roomView.kind === "chat"
        ? "Room chat"
        : roomView.kind === "requests"
          ? "Borrow requests"
          : null;

  return (
    <div className="app-shell">
      <Navbar />

      <main className="page-content">
        <div className="page">
          {/* Header with breadcrumbs: Rooms › Room › Member / Chat / Requests */}
          <div className="page-header">
            <div className="page-header-left" style={{ minWidth: 0 }}>
              {selectedRoom ? (
                <nav className="room-breadcrumbs" aria-label="Breadcrumb">
                  <button type="button" onClick={closeRoom}>Rooms</button>
                  <span aria-hidden="true">›</span>
                  {subTitle ? (
                    <>
                      <button type="button" onClick={() => setRoomView({ kind: "overview" })}>{selectedRoom.name}</button>
                      <span aria-hidden="true">›</span>
                      <span aria-current="page">{subTitle}</span>
                    </>
                  ) : (
                    <span aria-current="page">{selectedRoom.name}</span>
                  )}
                </nav>
              ) : (
                <div className="eyebrow">Shared Wardrobes</div>
              )}
              <h1 className="page-title">
                {selectedRoom ? (subTitle ?? selectedRoom.name) : "Rooms"}
              </h1>
            </div>

            <div style={{ display: "flex", gap: 10, flexShrink: 0, flexWrap: "wrap" }}>
              {!selectedRoom ? (
                <>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowJoinModal(true)}>
                    <Key size={13} />
                    Join Room
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowCreateModal(true)}>
                    <Plus size={13} />
                    Create Room
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => (roomView.kind === "overview" ? closeRoom() : setRoomView({ kind: "overview" }))}
                  >
                    <ChevronLeft size={14} />
                    {roomView.kind === "overview" ? "All rooms" : "Room overview"}
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowShareModal(true)} id="share-items-btn">
                    <Share2 size={13} />
                    Share items
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ── ROOMS LIST ── */}
          {!selectedRoom && (
            <>
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
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowJoinModal(true)}>
                          <Key size={13} />
                          Join Room
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowCreateModal(true)}>
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
                    <RoomCard key={room.id} room={room} onClick={openRoom} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── INSIDE A ROOM ── */}
          {selectedRoom && (
            <>
              {notice && (
                <div className="room-notice" role="status" id="room-notice">
                  <span><Check size={14} /> {notice}</span>
                  <button type="button" className="icon-btn" onClick={() => setNotice(null)} aria-label="Dismiss">
                    <CloseIcon />
                  </button>
                </div>
              )}
              {detailError && (
                <div style={{ marginBottom: 16 }}>
                  <ErrorNote message={detailError} />
                </div>
              )}

              {roomView.kind === "overview" && (
                <RoomOverview
                  room={selectedRoom}
                  members={members}
                  loading={membersLoading}
                  onOpenMember={(m) => setRoomView({ kind: "member", memberId: m.user_id })}
                  onOpenChat={() => setRoomView({ kind: "chat" })}
                  onOpenRequests={() => setRoomView({ kind: "requests" })}
                  onShareItems={() => setShowShareModal(true)}
                />
              )}

              {roomView.kind === "member" && viewedMember && (
                <MemberWardrobe
                  key={`${viewedMember.user_id}-${shareVersion}`}
                  room={selectedRoom}
                  member={viewedMember}
                  onChanged={refreshSharing}
                />
              )}
              {roomView.kind === "member" && !viewedMember && !membersLoading && (
                <EmptyState icon={Users} title="Member not found" description="They may have left this room." />
              )}

              {roomView.kind === "chat" && <RoomChat room={selectedRoom} members={members} />}

              {roomView.kind === "requests" && <BorrowRequests room={selectedRoom} members={members} />}
            </>
          )}
        </div>
      </main>

      {/* ── CREATE ROOM MODAL ── */}
      {showCreateModal && (
        <CreateRoomModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(room) => handleRoomReady(room, "created")}
        />
      )}

      {/* ── JOIN ROOM MODAL ── */}
      {showJoinModal && (
        <JoinRoomModal
          onClose={() => setShowJoinModal(false)}
          onJoined={(room) => handleRoomReady(room, "joined")}
        />
      )}

      {/* ── SHARE ITEMS MODAL ── */}
      {showShareModal && selectedRoom && user && (
        <ShareItemsModal
          room={selectedRoom}
          userId={user.id}
          onClose={() => setShowShareModal(false)}
          onSaved={() => {
            setShowShareModal(false);
            refreshSharing();
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
  userId,
  onClose,
  onSaved,
}: {
  room: Room;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharedIds, setSharedIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // Your closet, and what you already share in this room (from the database)
    Promise.all([fetchAllWardrobeItems(), fetchMemberSharedItems(room.id, userId)])
      .then(([data, shares]) => {
        if (!active) return;
        // Items marked "Share in Rooms" first
        setItems([...data].sort((a, b) => Number(b.is_shared) - Number(a.is_shared)));
        const ids = shares.map((s) => s.item.id);
        setSharedIds(ids);
        setSelected(new Set(ids));
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : "Failed to load your closet."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [room.id, userId]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id));

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)));

  const handleSave = async () => {
    if (saving) return;
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

        {!loading && items.length > 0 && (
          <div className="share-select-bar">
            <span id="share-selected-count" aria-live="polite">
              {selected.size} of {items.length} selected
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={toggleAll}
              disabled={saving}
              id="share-toggle-all"
              aria-label={allSelected ? "Deselect all items" : `Select all ${items.length} items`}
            >
              {allSelected ? "Deselect all" : `Select all (${items.length})`}
            </button>
          </div>
        )}

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
