import { useState } from "react";
import {
  Search,
  Plus,
  Key,
  Users,
  Shirt,
  SlidersHorizontal,
  RefreshCw,
} from "lucide-react";
import Navbar from "../components/Navbar";
import EmptyState from "../components/EmptyState";
import RoomCard, { RoomCardSkeleton } from "../components/RoomCard";
import WardrobeCard, { WardrobeCardSkeleton } from "../components/WardrobeCard";
import type { Room, WardrobeItem, LoadingState } from "../types";
import "../App.css";

type ActiveView = "rooms" | "room-detail";

const CATEGORY_FILTERS = [
  { value: "all", label: "All" },
  { value: "tops", label: "Tops" },
  { value: "bottoms", label: "Bottoms" },
  { value: "dresses", label: "Dresses" },
  { value: "outerwear", label: "Outerwear" },
  { value: "footwear", label: "Footwear" },
  { value: "accessories", label: "Accessories" },
];

export default function Rooms() {
  const [view, setView] = useState<ActiveView>("rooms");
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [roomSearch, setRoomSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // Data — ready for Supabase
  const [rooms] = useState<Room[]>([]);
  const [roomItems] = useState<WardrobeItem[]>([]);
  const [roomsLoading] = useState<LoadingState>("success");
  const [itemsLoading] = useState<LoadingState>("success");

  const handleRoomSelect = (room: Room) => {
    setSelectedRoom(room);
    setView("room-detail");
  };

  const filteredRooms = rooms.filter((r) =>
    r.name.toLowerCase().includes(roomSearch.toLowerCase())
  );

  const filteredItems =
    activeFilter === "all"
      ? roomItems
      : roomItems.filter((i) => i.category === activeFilter);

  const searchedItems = itemSearch
    ? filteredItems.filter((i) =>
        i.name.toLowerCase().includes(itemSearch.toLowerCase())
      )
    : filteredItems;

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
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setView("rooms");
                    setSelectedRoom(null);
                  }}
                >
                  Back to Rooms
                </button>
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
                  description="Something went wrong. Please try again."
                  action={
                    <button className="btn btn-secondary btn-sm">
                      <RefreshCw size={13} />
                      Retry
                    </button>
                  }
                />
              ) : filteredRooms.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No rooms yet"
                  description="Create a room to share your wardrobe with friends, or join one with a passcode."
                  action={
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
                        {selectedRoom.member_count} member
                        {selectedRoom.member_count !== 1 ? "s" : ""}
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
                    description="Members haven't shared any items in this room yet."
                  />
                ) : searchedItems.length === 0 ? (
                  <EmptyState
                    icon={Search}
                    title="No items found"
                    description={`No items match "${itemSearch}".`}
                  />
                ) : (
                  <div className="item-grid">
                    {searchedItems.map((item) => (
                      <WardrobeCard key={item.id} item={item} />
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
                  <EmptyState
                    icon={Users}
                    title="No member data"
                    description="Room members will appear here."
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── CREATE ROOM MODAL ── */}
      {showCreateModal && (
        <CreateRoomModal onClose={() => setShowCreateModal(false)} />
      )}

      {/* ── JOIN ROOM MODAL ── */}
      {showJoinModal && (
        <JoinRoomModal onClose={() => setShowJoinModal(false)} />
      )}
    </div>
  );
}

/* ─── Create Room Modal ─────────────────────────────────────── */
function CreateRoomModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(28, 23, 20, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: 20,
      }}
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
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M1 1l12 12M13 1L1 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
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
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 16px",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-lg)",
              background: "var(--cream-dark)",
            }}
          >
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Private room</div>
              <div style={{ fontSize: 12, color: "var(--brown-soft)", marginTop: 2 }}>
                Members join with a passcode
              </div>
            </div>
            <label
              style={{
                position: "relative",
                display: "inline-block",
                width: 40,
                height: 22,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                style={{ opacity: 0, width: 0, height: 0 }}
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
              />
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 11,
                  background: isPrivate ? "var(--espresso)" : "var(--muted)",
                  transition: "background 0.2s",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: isPrivate ? 21 : 3,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "white",
                  transition: "left 0.2s",
                }}
              />
            </label>
          </div>

          <button
            className="btn btn-primary"
            style={{ width: "100%" }}
            disabled={!name.trim()}
            onClick={() => {
              // TODO: create room in Supabase
              onClose();
            }}
          >
            Create Room
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Join Room Modal ───────────────────────────────────────── */
function JoinRoomModal({ onClose }: { onClose: () => void }) {
  const [passcode, setPasscode] = useState("");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(28, 23, 20, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: 20,
      }}
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
              Enter Passcode
            </h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M1 1l12 12M13 1L1 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="passcode">
              Room Passcode
            </label>
            <input
              id="passcode"
              className="form-input"
              placeholder="Enter passcode"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              style={{ letterSpacing: 3, textAlign: "center" }}
            />
          </div>

          <button
            className="btn btn-primary"
            style={{ width: "100%" }}
            disabled={!passcode.trim()}
            onClick={() => {
              // TODO: look up room by passcode in Supabase
              onClose();
            }}
          >
            Join Room
          </button>
        </div>
      </div>
    </div>
  );
}
