import { useState } from "react";
import { Copy, Check, MessageCircle, Repeat2, Share2, Users, ChevronRight } from "lucide-react";
import EmptyState from "../EmptyState";
import MemberAvatar from "../MemberAvatar";
import type { Room, RoomMemberProfile } from "../../types";

interface RoomOverviewProps {
  room: Room;
  members: RoomMemberProfile[];
  loading: boolean;
  onOpenMember: (member: RoomMemberProfile) => void;
  onOpenChat: () => void;
  onOpenRequests: () => void;
  onShareItems: () => void;
}

export default function RoomOverview({
  room,
  members,
  loading,
  onOpenMember,
  onOpenChat,
  onOpenRequests,
  onShareItems,
}: RoomOverviewProps) {
  const [copied, setCopied] = useState(false);
  const totalShared = members.reduce((sum, m) => sum + m.shared_count, 0);

  const copyCode = async () => {
    if (!room.invite_code) return;
    try {
      await navigator.clipboard.writeText(room.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the code stays visible to copy by hand
    }
  };

  return (
    <div className="room-overview">
      <section className="room-summary panel">
        <div className="room-summary-text">
          {room.description && <p className="room-summary-description">{room.description}</p>}
          <div className="room-summary-stats">
            <span><Users size={13} /> {members.length || room.member_count} member{(members.length || room.member_count) !== 1 ? "s" : ""}</span>
            <span><Share2 size={13} /> {totalShared} item{totalShared !== 1 ? "s" : ""} shared</span>
          </div>
        </div>
        {room.invite_code && (
          <div className="room-invite">
            <div className="room-invite-label">Invite code</div>
            <div className="room-invite-row">
              <code id="room-invite-code">{room.invite_code}</code>
              <button type="button" className="icon-btn" onClick={copyCode} aria-label="Copy invite code" title="Copy invite code">
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="room-entry-grid">
        <button type="button" className="room-entry panel" onClick={onOpenChat} id="open-room-chat">
          <span className="room-entry-icon"><MessageCircle size={18} /></span>
          <span className="room-entry-text">
            <strong>Room chat</strong>
            <span>Talk outfits with everyone in {room.name}</span>
          </span>
          <ChevronRight size={16} />
        </button>
        <button type="button" className="room-entry panel" onClick={onOpenRequests} id="open-borrow-requests">
          <span className="room-entry-icon"><Repeat2 size={18} /></span>
          <span className="room-entry-text">
            <strong>Borrow requests</strong>
            <span>Requests for your items and the ones you've sent</span>
          </span>
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="section-header room-section-header">
        <span className="section-title">Wardrobes in this room</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onShareItems}>
          <Share2 size={13} /> Share your items
        </button>
      </div>

      {loading && members.length === 0 ? (
        <div className="member-grid">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="member-card panel skeleton" style={{ height: 156 }} />
          ))}
        </div>
      ) : members.length === 0 ? (
        <EmptyState icon={Users} title="No members found" description="Members of this room will appear here." />
      ) : (
        <div className="member-grid" id="member-grid">
          {members.map((m) => (
            <button
              key={m.user_id}
              type="button"
              className="member-card panel"
              onClick={() => onOpenMember(m)}
              aria-label={`View ${m.is_me ? "your" : `${m.display_name}'s`} wardrobe`}
            >
              <MemberAvatar name={m.display_name} url={m.avatar_url} size={52} />
              <span className="member-card-name">
                {m.is_me ? "Your wardrobe" : `${m.display_name}'s Wardrobe`}
              </span>
              <span className="member-card-meta">
                {m.shared_count} item{m.shared_count !== 1 ? "s" : ""} shared
                {m.role === "owner" ? " · Room owner" : ""}
              </span>
              <span className="member-card-cta">View wardrobe <ChevronRight size={14} /></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
