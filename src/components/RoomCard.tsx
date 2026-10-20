import { Users, Lock } from "lucide-react";
import type { Room } from "../types";

interface RoomCardProps {
  room: Room;
  onClick?: (room: Room) => void;
}

export default function RoomCard({ room, onClick }: RoomCardProps) {
  return (
    <div className="room-card" onClick={() => onClick?.(room)}>
      <div className="room-card-cover">
        {room.cover_image_url ? (
          <img src={room.cover_image_url} alt={room.name} loading="lazy" />
        ) : (
          <Users size={28} />
        )}
        {room.is_private && (
          <div className="room-card-badge">
            <Lock size={10} style={{ display: "inline", marginRight: 4 }} />
            Private
          </div>
        )}
      </div>

      <div className="room-card-body">
        <div className="room-card-name">{room.name}</div>
        {room.description && (
          <div className="room-card-meta" style={{ marginTop: 2, marginBottom: 8 }}>
            {room.description}
          </div>
        )}
        <div className="room-card-meta" style={{ display: "flex", gap: 12, marginTop: 6 }}>
          <span>{room.member_count} member{room.member_count !== 1 ? "s" : ""}</span>
          <span>{room.item_count} item{room.item_count !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Skeleton ──────────────────────────────────────────────── */
export function RoomCardSkeleton() {
  return (
    <div className="room-card" style={{ pointerEvents: "none" }}>
      <div
        className="room-card-cover skeleton"
        style={{ height: 120 }}
      />
      <div className="room-card-body">
        <div className="skeleton skeleton-text" />
        <div className="skeleton skeleton-text skeleton-text-short" style={{ marginTop: 6 }} />
      </div>
    </div>
  );
}
