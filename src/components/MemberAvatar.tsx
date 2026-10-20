import { useState } from "react";

/** Profile picture, or the member's initial when there is none (or it fails to load) */
export default function MemberAvatar({
  name,
  url,
  size = 40,
}: {
  name: string;
  url?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (url && !failed) {
    return (
      <img
        className="member-avatar"
        src={url}
        alt=""
        style={style}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="member-avatar member-avatar--initial" style={style} aria-hidden="true">
      {(name.trim().charAt(0) || "?").toUpperCase()}
    </span>
  );
}
