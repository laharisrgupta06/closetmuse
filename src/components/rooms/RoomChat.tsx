import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Send, Loader2, MessageCircle, RefreshCw, AlertCircle } from "lucide-react";
import EmptyState from "../EmptyState";
import MemberAvatar from "../MemberAvatar";
import { fetchMessages, MAX_MESSAGE_LENGTH, sendMessage, subscribeToRoom } from "../../services/chatService";
import type { Room, RoomMemberProfile, RoomMessage } from "../../types";

const POLL_MS = 5000;

function mergeMessages(current: RoomMessage[], incoming: RoomMessage[]): RoomMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

const timeLabel = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

export default function RoomChat({ room, members }: { room: Room; members: RoomMemberProfile[] }) {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [live, setLive] = useState<boolean | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const byId = new Map(members.map((m) => [m.user_id, m]));

  const refresh = useCallback(async () => {
    try {
      const latest = await fetchMessages(room.id);
      setMessages((prev) => mergeMessages(prev, latest));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load messages.");
    }
  }, [room.id]);

  // Initial load + live subscription
  useEffect(() => {
    let active = true;
    fetchMessages(room.id)
      .then((data) => active && setMessages(data))
      .catch((e) => active && setLoadError(e instanceof Error ? e.message : "Failed to load messages."))
      .finally(() => active && setLoading(false));
    const unsubscribe = subscribeToRoom(
      room.id,
      (m) => active && setMessages((prev) => mergeMessages(prev, [m])),
      (isLive) => active && setLive(isLive)
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [room.id]);

  // Fallback: poll while the live connection isn't working
  useEffect(() => {
    if (live !== false) return;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [live, refresh]);

  // Keep the newest message in view
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const saved = await sendMessage(room.id, body);
      setMessages((prev) => mergeMessages(prev, [saved]));
      setText("");
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Message not sent.");
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="room-chat panel">
      <div className="room-chat-status">
        {live === true ? "Live" : live === false ? "Reconnecting… new messages refresh every few seconds" : "Connecting…"}
      </div>

      <div className="room-chat-list" ref={listRef} id="chat-messages" aria-live="polite">
        {loading ? (
          <div className="room-chat-placeholder"><Loader2 size={16} className="spin" /> Loading messages…</div>
        ) : loadError && messages.length === 0 ? (
          <EmptyState
            icon={AlertCircle}
            title="Couldn't load the chat"
            description={loadError}
            action={<button className="btn btn-secondary btn-sm" onClick={refresh}><RefreshCw size={13} /> Retry</button>}
          />
        ) : messages.length === 0 ? (
          <EmptyState icon={MessageCircle} title="No messages yet" description={`Start the conversation in ${room.name}.`} />
        ) : (
          messages.map((m, i) => {
            const sender = byId.get(m.sender_id);
            const mine = Boolean(sender?.is_me);
            const name = sender ? (mine ? "You" : sender.display_name) : "Former member";
            const grouped = i > 0 && messages[i - 1].sender_id === m.sender_id &&
              new Date(m.created_at).getTime() - new Date(messages[i - 1].created_at).getTime() < 5 * 60_000;
            return (
              <div key={m.id} className={`chat-message${mine ? " chat-message--mine" : ""}${grouped ? " chat-message--grouped" : ""}`}>
                {!mine && (
                  <div className="chat-message-avatar">
                    {!grouped && <MemberAvatar name={sender?.display_name ?? "?"} url={sender?.avatar_url} size={30} />}
                  </div>
                )}
                <div className="chat-message-content">
                  {!grouped && (
                    <div className="chat-message-meta">
                      <span className="chat-message-name">{name}</span>
                      <time dateTime={m.created_at}>{timeLabel(m.created_at)}</time>
                    </div>
                  )}
                  <div className="chat-bubble">{m.body}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {sendError && <div className="room-chat-error" role="alert"><AlertCircle size={13} /> {sendError}</div>}

      <form
        className="room-chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <textarea
          className="form-textarea"
          rows={1}
          placeholder="Message the room…"
          title="Enter to send · Shift+Enter for a new line"
          value={text}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Message"
          id="chat-input"
        />
        <button type="submit" className="btn btn-primary" disabled={!text.trim() || sending} aria-label="Send message" id="chat-send">
          {sending ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
        </button>
      </form>
    </div>
  );
}
