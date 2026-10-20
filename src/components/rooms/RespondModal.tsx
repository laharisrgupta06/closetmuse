import { useEffect, useRef, useState } from "react";
import { hasBorrowReplies } from "../../services/borrowService";
import { X, Loader2, AlertCircle } from "lucide-react";

const SUGGESTIONS = {
  accept: [
    "Please handle it carefully.",
    "It’s delicate; please don’t wash it.",
    "Please return it in the same condition.",
  ],
  decline: [
    "Sorry, I need it myself.",
    "Sorry, I’ve already lent it to someone.",
    "Sorry, I can’t lend it right now.",
    "Sorry, it’s delicate and I don’t want it damaged.",
  ],
};

interface RespondModalProps {
  accept: boolean;
  itemName: string;
  requesterName: string;
  onCancel: () => void;
  /** Resolves when the server confirmed the change; rejects with a message otherwise */
  onConfirm: (reply: string) => Promise<void>;
}

/** Confirms accepting or declining a borrow request, with an optional reply */
export default function RespondModal({ accept, itemName, requesterName, onCancel, onConfirm }: RespondModalProps) {
  const [reply, setReply] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null while checking; false before migration 007 (replies can't be stored)
  const [repliesSupported, setRepliesSupported] = useState<boolean | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // Synchronous guard: two clicks in the same tick both see submitting=false
  const inFlight = useRef(false);
  const suggestions = accept ? SUGGESTIONS.accept : SUGGESTIONS.decline;

  useEffect(() => {
    let live = true;
    hasBorrowReplies().then((ok) => live && setRepliesSupported(ok));
    return () => {
      live = false;
    };
  }, []);
  const repliesOff = repliesSupported === false;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, submitting]);

  const confirm = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(repliesOff ? "" : reply);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the request.");
      setSubmitting(false);
      inFlight.current = false;
    }
  };

  const pick = (text: string) => {
    setReply(text);
    textRef.current?.focus();
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && !submitting && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="respond-title"
    >
      <div className="respond-modal panel" id="respond-modal">
        <button type="button" className="icon-btn respond-close" onClick={onCancel} disabled={submitting} aria-label="Close">
          <X size={15} />
        </button>
        <h2 id="respond-title" className="respond-title">
          {accept ? "Accept this request?" : "Decline this request?"}
        </h2>
        <p className="respond-sub">
          {requesterName} asked to borrow <strong>{itemName}</strong>.
        </p>

        <label className="form-label" htmlFor="respond-reply">
          Message to {requesterName} <span className="respond-optional">(optional)</span>
        </label>
        <div className="respond-suggestions" role="group" aria-label="Suggested replies">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className={`filter-chip${reply === s ? " active" : ""}`}
              aria-pressed={reply === s}
              onClick={() => pick(s)}
              disabled={submitting || repliesOff}
            >
              {s}
            </button>
          ))}
        </div>
        <textarea
          ref={textRef}
          id="respond-reply"
          className="form-textarea"
          rows={3}
          maxLength={500}
          placeholder={
            repliesOff
              ? "Replies aren't available yet"
              : accept
                ? "Add a note about care or return (optional)"
                : "Let them know why (optional)"
          }
          value={repliesOff ? "" : reply}
          onChange={(e) => setReply(e.target.value)}
          disabled={submitting || repliesOff}
          aria-describedby={repliesOff ? "respond-reply-unavailable" : undefined}
        />
        {repliesOff && (
          <p className="field-hint" id="respond-reply-unavailable">
            Replies need database update 007, which hasn’t been applied yet. You can still{" "}
            {accept ? "accept" : "decline"} without a message.
          </p>
        )}

        {error && (
          <div className="item-detail-error" role="alert" style={{ marginTop: 10 }}>
            <AlertCircle size={13} /> {error}
          </div>
        )}

        <div className="respond-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={submitting} id="respond-cancel">
            Cancel
          </button>
          <button
            type="button"
            className={`btn btn-sm ${accept ? "btn-primary" : "btn-secondary respond-decline"}`}
            onClick={confirm}
            disabled={submitting}
            id="respond-confirm"
          >
            {submitting ? (
              <><Loader2 size={13} className="spin" /> {accept ? "Accepting…" : "Declining…"}</>
            ) : accept ? (
              "Confirm accept"
            ) : (
              "Confirm decline"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
