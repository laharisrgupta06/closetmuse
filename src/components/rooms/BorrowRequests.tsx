import { useCallback, useEffect, useState } from "react";
import { Repeat2, RefreshCw, Loader2, AlertCircle, Check } from "lucide-react";
import EmptyState from "../EmptyState";
import MemberAvatar from "../MemberAvatar";
import RespondModal from "./RespondModal";
import { cancelBorrow, fetchRoomBorrowRequests, respondToBorrow, type BorrowRequestView } from "../../services/borrowService";
import type { Room, RoomMemberProfile } from "../../types";
import { formatItemNumber, itemReference } from "../../utils/numbering";

const STATUS_LABEL = { pending: "Pending", accepted: "Accepted", declined: "Declined", cancelled: "Cancelled" } as const;

const formatDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";

export default function BorrowRequests({
  room,
  members,
  initialTab,
  focusRequestId,
}: {
  room: Room;
  members: RoomMemberProfile[];
  /** Opened from a notification: start on this tab */
  initialTab?: "incoming" | "outgoing";
  /** Opened from a notification: highlight this request */
  focusRequestId?: string;
}) {
  const [requests, setRequests] = useState<BorrowRequestView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"incoming" | "outgoing">(initialTab ?? "incoming");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [responding, setResponding] = useState<{ request: BorrowRequestView; accept: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  // Refresh after an action without blanking the list
  const refresh = useCallback(async () => {
    try {
      setRequests(await fetchRoomBorrowRequests(room.id));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to refresh borrow requests.");
    }
  }, [room.id]);

  const openRespond = (request: BorrowRequestView, accept: boolean) => {
    setNotice(null);
    setActionError(null);
    setResponding({ request, accept });
  };

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
    setNotice(null);
    try {
      await task();
      await refresh();
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
      {notice && <div className="item-detail-notice" role="status" style={{ marginBottom: 12 }} id="borrow-notice"><Check size={13} /> {notice}</div>}

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
              <li
                key={r.id}
                className={`borrow-row panel${r.id === focusRequestId ? " borrow-row-focus" : ""}`}
                ref={r.id === focusRequestId ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                data-request-id={r.id}
              >
                <div className="borrow-thumb">
                  {r.item?.image_url ? <img src={r.item.image_url} alt="" /> : <Repeat2 size={18} />}
                </div>
                <div className="borrow-info">
                  <div className="borrow-item-name">
                    {r.item?.name ?? "Item no longer shared"}
                    {/* Incoming requests are for your items; outgoing ones name the owner */}
                    {itemReference(r.item?.item_number, tab === "incoming" ? null : otherName) && (
                      <span className="item-number borrow-item-number">
                        {itemReference(r.item?.item_number, tab === "incoming" ? null : otherName)}
                      </span>
                    )}
                  </div>
                  <div className="borrow-party">
                    <MemberAvatar name={otherName} url={other?.avatar_url} size={20} />
                    {tab === "incoming" ? `${otherName} asked to borrow` : `Owned by ${otherName}`}
                    <span className="borrow-date">· {formatDate(r.created_at)}</span>
                  </div>
                  {r.message && (
                    <p className="borrow-message">
                      <span className="borrow-message-label">{tab === "incoming" ? `Note from ${otherName}` : "Your note"}</span>
                      “{r.message}”
                    </p>
                  )}
                  {r.responded_at && r.status !== "pending" && (
                    <div className="borrow-date">{STATUS_LABEL[r.status]} on {formatDate(r.responded_at)}</div>
                  )}
                  {r.response_message && (
                    <p className="borrow-message borrow-reply">
                      <span className="borrow-message-label">{tab === "incoming" ? "Your reply" : `${otherName}'s reply`}</span>
                      “{r.response_message}”
                    </p>
                  )}
                </div>
                <div className="borrow-side">
                  <span className={`borrow-status borrow-status--${r.status}`}>{STATUS_LABEL[r.status]}</span>
                  {r.status === "pending" && tab === "incoming" && (
                    <div className="borrow-actions">
                      <button className="btn btn-primary btn-sm" disabled={busyId !== null} onClick={() => openRespond(r, true)}>
                        Accept
                      </button>
                      <button className="btn btn-secondary btn-sm" disabled={busyId !== null} onClick={() => openRespond(r, false)}>
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

      {responding && (
        <RespondModal
          accept={responding.accept}
          itemName={
            responding.request.item
              ? [responding.request.item.name, formatItemNumber(responding.request.item.item_number)].filter(Boolean).join(" ")
              : "this item"
          }
          requesterName={byId.get(responding.request.requester_id)?.display_name ?? "The requester"}
          onCancel={() => setResponding(null)}
          onConfirm={async (reply) => {
            await respondToBorrow(responding.request.id, responding.accept, reply);
            setResponding(null);
            setNotice(responding.accept ? "Request accepted." : "Request declined.");
            await refresh();
          }}
        />
      )}
    </div>
  );
}
