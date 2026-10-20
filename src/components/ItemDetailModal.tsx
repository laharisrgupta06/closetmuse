/**
 * ItemDetailModal.tsx
 * Full details of one wardrobe item: large uncropped image (click to enlarge),
 * every stored metadata field, owner and sharing, and only the actions the
 * viewer is allowed to take.
 */
import { useCallback, useEffect, useState } from "react";
import { X, Edit2, Trash2, Loader2, Maximize2, Lock, Share2, Check, AlertCircle } from "lucide-react";
import type { BorrowRequest, WardrobeItem } from "../types";
import { CATEGORY_DEFINITIONS, getNormalizedCategory } from "../utils/category";
import { fetchItemRooms, unshareItem } from "../services/roomService";
import { cancelBorrow, fetchMyRequestsForItem, requestBorrow } from "../services/borrowService";

interface ItemDetailModalProps {
  item: WardrobeItem;
  /** Display name of the owner when it isn't the viewer */
  ownerName?: string;
  isOwner: boolean;
  onClose: () => void;
  /** Owner actions (omit to hide) */
  onEdit?: (item: WardrobeItem) => void;
  onDelete?: (item: WardrobeItem) => Promise<void>;
  /** Owner: list the rooms this item is shared in, with Stop sharing */
  showSharing?: boolean;
  /** Called after the owner stops sharing the item in a room */
  onUnshared?: (roomId: string) => void;
  /** Viewing another member's item inside this room: offer borrowing */
  borrowRoomId?: string;
}

const formatDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : null;

const cap = (s?: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

export default function ItemDetailModal({
  item,
  ownerName,
  isOwner,
  onClose,
  onEdit,
  onDelete,
  showSharing = false,
  onUnshared,
  borrowRoomId,
}: ItemDetailModalProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [rooms, setRooms] = useState<{ id: string; name: string }[] | null>(null);
  const [myRequests, setMyRequests] = useState<BorrowRequest[] | null>(null);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const hasOriginal = Boolean(item.original_image_url && item.original_image_url !== item.image_url);
  const imageSrc = showOriginal && hasOriginal ? item.original_image_url! : item.image_url;
  const category = getNormalizedCategory(item);
  const categoryLabel = CATEGORY_DEFINITIONS.find((c) => c.value === category)?.label ?? cap(category);

  const loadSharing = useCallback(() => {
    fetchItemRooms(item.id)
      .then(setRooms)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load sharing details."));
  }, [item.id]);

  const loadRequests = useCallback(() => {
    if (!borrowRoomId) return;
    fetchMyRequestsForItem(borrowRoomId, item.id)
      .then(setMyRequests)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load your requests."));
  }, [borrowRoomId, item.id]);

  useEffect(() => {
    if (isOwner && showSharing) loadSharing();
    if (!isOwner) loadRequests();
  }, [isOwner, showSharing, loadSharing, loadRequests]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (zoomed) setZoomed(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed, onClose]);

  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const handleUnshare = (room: { id: string; name: string }) =>
    run(`unshare-${room.id}`, async () => {
      if (!confirm(`Stop sharing "${item.name}" in ${room.name}? It stays in your closet and in any other rooms.`)) return;
      await unshareItem(room.id, item.id);
      setRooms((prev) => (prev ?? []).filter((r) => r.id !== room.id));
      onUnshared?.(room.id);
      setNotice(`No longer shared in ${room.name}.`);
    });

  const handleDelete = () =>
    run("delete", async () => {
      if (!onDelete) return;
      if (!confirm(`Permanently delete "${item.name}" from your wardrobe?`)) return;
      await onDelete(item);
      onClose();
    });

  const handleRequest = () =>
    run("request", async () => {
      if (!borrowRoomId) return;
      await requestBorrow(borrowRoomId, item.id, message);
      setMessage("");
      setNotice("Request sent. The owner will see it in the room's Borrow requests.");
      loadRequests();
    });

  const handleCancel = (requestId: string) =>
    run("cancel", async () => {
      await cancelBorrow(requestId);
      setNotice("Request cancelled.");
      loadRequests();
    });

  const latest = myRequests?.[0];
  const pending = latest?.status === "pending" ? latest : undefined;
  const updated =
    item.updated_at && item.created_at &&
    new Date(item.updated_at).getTime() - new Date(item.created_at).getTime() > 60_000
      ? formatDate(item.updated_at)
      : null;

  const details: [string, string | null | undefined][] = [
    ["Category", categoryLabel],
    ["Type", item.subcategory],
    ["Style branch", item.style_branch],
    ["Colour", item.color],
    ["Material", item.material],
    ["Pattern / craft", item.pattern],
    ["Occasion", cap(item.occasion)],
    ["Style", cap(item.style)],
    ["Brand", item.brand],
    ["Added", formatDate(item.created_at)],
    ["Last updated", updated],
  ];

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={item.name}>
      <div className="item-detail">
        <button type="button" className="icon-btn item-detail-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>

        <div className="item-detail-media">
          <button type="button" className="item-detail-frame" onClick={() => imageSrc && setZoomed(true)} aria-label="Enlarge image">
            {imageSrc ? <img src={imageSrc} alt={item.name} /> : <span className="outfit-piece-noimage">No photo</span>}
            {imageSrc && (
              <span className="item-detail-zoom-hint">
                <Maximize2 size={12} /> Enlarge
              </span>
            )}
          </button>
          {hasOriginal && (
            <div className="item-detail-toggle" role="group" aria-label="Image version">
              <button type="button" className={`filter-chip${!showOriginal ? " active" : ""}`} onClick={() => setShowOriginal(false)}>
                Cut-out
              </button>
              <button type="button" className={`filter-chip${showOriginal ? " active" : ""}`} onClick={() => setShowOriginal(true)}>
                Original photo
              </button>
            </div>
          )}
        </div>

        <div className="item-detail-body">
          <div className="eyebrow">{categoryLabel}{item.subcategory ? ` · ${item.subcategory}` : ""}</div>
          <h2 className="item-detail-title">{item.name}</h2>
          <div className="item-detail-owner">
            {isOwner ? "Your item" : `Shared by ${ownerName ?? "a member"}`}
          </div>

          <dl className="item-detail-fields">
            {details
              .filter(([, v]) => v && String(v).trim())
              .map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
          {item.notes && <p className="item-detail-notes">{item.notes}</p>}

          {isOwner && showSharing && (
            <div className="item-detail-section">
              <div className="item-detail-section-title">Sharing</div>
              {rooms === null ? (
                <span className="item-detail-muted"><Loader2 size={12} className="spin" /> Checking rooms…</span>
              ) : rooms.length === 0 ? (
                <span className="item-detail-muted"><Lock size={12} /> Private — not shared in any room</span>
              ) : (
                <ul className="item-detail-rooms">
                  {rooms.map((r) => (
                    <li key={r.id}>
                      <Share2 size={12} /> {r.name}
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => handleUnshare(r)}>
                        {busy === `unshare-${r.id}` ? "Stopping…" : "Stop sharing"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!isOwner && borrowRoomId && (
            <div className="item-detail-section">
              <div className="item-detail-section-title">Borrow</div>
              {myRequests === null ? (
                <span className="item-detail-muted"><Loader2 size={12} className="spin" /> Checking your requests…</span>
              ) : pending ? (
                <div className="item-detail-request">
                  <span className="borrow-status borrow-status--pending">Request pending</span>
                  <span className="item-detail-muted">Sent {formatDate(pending.created_at)}</span>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => handleCancel(pending.id)}>
                    {busy === "cancel" ? "Cancelling…" : "Cancel request"}
                  </button>
                </div>
              ) : (
                <>
                  {latest && (
                    <div className="item-detail-muted" style={{ marginBottom: 8 }}>
                      Your last request was <strong>{latest.status}</strong>
                      {latest.responded_at ? ` on ${formatDate(latest.responded_at)}` : ""}.
                    </div>
                  )}
                  <textarea
                    className="form-textarea"
                    rows={2}
                    maxLength={500}
                    placeholder={`Add a note for ${ownerName ?? "the owner"} (optional)`}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                  <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 8 }} disabled={busy !== null} onClick={handleRequest} id="request-borrow-btn">
                    {busy === "request" ? <><Loader2 size={13} className="spin" /> Sending…</> : "Request to borrow"}
                  </button>
                </>
              )}
            </div>
          )}

          {notice && (
            <div className="item-detail-notice" role="status"><Check size={13} /> {notice}</div>
          )}
          {error && (
            <div className="item-detail-error" role="alert"><AlertCircle size={13} /> {error}</div>
          )}

          {isOwner && (onEdit || onDelete) && (
            <div className="item-detail-actions">
              {onEdit && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(item)} disabled={busy !== null}>
                  <Edit2 size={13} /> Edit details
                </button>
              )}
              {onDelete && (
                <button type="button" className="btn btn-ghost btn-sm item-detail-delete" onClick={handleDelete} disabled={busy !== null}>
                  {busy === "delete" ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />} Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {zoomed && imageSrc && (
        <div className="item-zoom" onClick={() => setZoomed(false)} role="dialog" aria-label="Enlarged image">
          <img src={imageSrc} alt={item.name} />
          <button type="button" className="icon-btn item-zoom-close" aria-label="Close enlarged image">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
