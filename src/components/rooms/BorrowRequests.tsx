import { useCallback, useEffect, useState } from "react";
import { Repeat2, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import EmptyState from "../EmptyState";
import MemberAvatar from "../MemberAvatar";
import { cancelBorrow, fetchRoomBorrowRequests, respondToBorrow, type BorrowRequestView } from "../../services/borrowService";
import type { Room, RoomMemberProfile } from "../../types";

const STATUS_LABEL = { pending: "Pending", accepted: "Accepted", declined: "Declined", cancelled: "Cancelled" } as const;

const formatDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";

export default function BorrowRequests({ room, members }: { room: Room; members: RoomMemberProfile[] }) {
  const [requests, setRequests] = useState<BorrowRequestView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const byId = new Map(members.map((m) => [m.user_id, m]));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRequests(await fetchRoomBorrowRequests(room.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load borrow requests.");
    } finally {
      setLoading(false);
    }
  }, [room.id]);

  useEffect(() => {
    let active = true;
    fetchRoomBorrowRequests(room.id)
      .then((data) => active && setRequests(data))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Failed to load borrow requests."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [room.id]);

  const act = async (id: string, task: () => Promise<unknown>) => {
    setBusyId(id);
    setActionError(null);
    try {
      await task();
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not update the request.");
    } finally {
      setBusyId(null);
    }
  };

  const incoming = requests.filter((r) => r.direction === "incoming");
  const outgoing = requests.filter((r) => r.direction === "outgoing");
  const list = tab === "incoming" ? incoming : outgoing;
  const pendingIncoming = incoming.filter((r) => r.status === "pending").length;

  return (
    <div className="borrow-requests">
      <div className="tab-bar" style={{ marginBottom: 16 }}>
        <button className={`tab-item${tab === "incoming" ? " active" : ""}`} onClick={() => setTab("incoming")} id="tab-incoming">
          For your items{pendingIncoming ? ` (${pendingIncoming} pending)` : ""}
        </button>
        <button className={`tab-item${tab === "outgoing" ? " active" : ""}`} onClick={() => setTab("outgoing")} id="tab-outgoing">
          Your requests
        </button>
      </div>

      {actionError && <div className="item-detail-error" role="alert" style={{ marginBottom: 12 }}><AlertCircle size={13} /> {actionError}</div>}

      {loading ? (
        <div className="room-chat-placeholder"><Loader2 size={16} className="spin" /> Loading requests…</div>
      ) : error ? (
        <EmptyState
          icon={AlertCircle}
          title="Couldn't load borrow requests"
          description={error}
          action={<button className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={13} /> Retry</button>}
        />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Repeat2}
          title={tab === "incoming" ? "No requests for your items" : "You haven't requested anything"}
          description={
            tab === "incoming"
              ? "When a member asks to borrow something you shared here, it shows up in this list."
              : "Open a member's wardrobe, choose an item and tap “Request to borrow”."
          }
        />
      ) : (
        <ul className="borrow-list" id="borrow-list">
          {list.map((r) => {
            const other = byId.get(tab === "incoming" ? r.requester_id : r.owner_id);
            const otherName = other?.display_name ?? "Former member";
            return (
              <li key={r.id} className="borrow-row panel">
                <div className="borrow-thumb">
                  {r.item?.image_url ? <img src={r.item.image_url} alt="" /> : <Repeat2 size={18} />}
                </div>
                <div className="borrow-info">
                  <div className="borrow-item-name">{r.item?.name ?? "Item no longer shared"}</div>
                  <div className="borrow-party">
                    <MemberAvatar name={otherName} url={other?.avatar_url} size={20} />
                    {tab === "incoming" ? `${otherName} asked to borrow` : `Owned by ${otherName}`}
                    <span className="borrow-date">· {formatDate(r.created_at)}</span>
                  </div>
                  {r.message && <p className="borrow-message">“{r.message}”</p>}
                  {r.responded_at && r.status !== "pending" && (
                    <div className="borrow-date">{STATUS_LABEL[r.status]} on {formatDate(r.responded_at)}</div>
                  )}
                </div>
                <div className="borrow-side">
                  <span className={`borrow-status borrow-status--${r.status}`}>{STATUS_LABEL[r.status]}</span>
                  {r.status === "pending" && tab === "incoming" && (
                    <div className="borrow-actions">
                      <button className="btn btn-primary btn-sm" disabled={busyId !== null} onClick={() => act(r.id, () => respondToBorrow(r.id, true))}>
                        {busyId === r.id ? <Loader2 size={13} className="spin" /> : "Accept"}
                      </button>
                      <button className="btn btn-secondary btn-sm" disabled={busyId !== null} onClick={() => act(r.id, () => respondToBorrow(r.id, false))}>
                        Decline
                      </button>
                    </div>
                  )}
                  {r.status === "pending" && tab === "outgoing" && (
                    <button className="btn btn-ghost btn-sm" disabled={busyId !== null} onClick={() => act(r.id, () => cancelBorrow(r.id))}>
                      {busyId === r.id ? "Cancelling…" : "Cancel"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
