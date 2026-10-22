import { useState } from "react";
import type { CSSProperties } from "react";

/**
 * The wardrobe behind My Closet: a full-width cabinet (cornice, side pillars,
 * plinth, lit back wall, brass rail, shelf) with gold hangers and garments,
 * and two panelled doors that swing open once per browser session.
 *
 * Purely decorative: hidden from assistive technology, never interactive, and
 * fixed behind the page so the user's clothes stay in front. Every hanger is
 * its own element animated with CSS transforms (GPU-composited, no repaints);
 * the doors use 3D transforms. With reduced motion the doors start open and
 * nothing moves.
 */

const SESSION_KEY = "closetmuse:wardrobe-opened";

/** True the first time in this browser session; storage failures just skip the animation */
function firstVisitThisSession(): boolean {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return false;
    sessionStorage.setItem(SESSION_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

type Garment = "blouse" | "dress" | "coat" | "shirt" | "none";

interface HangerSpec {
  /** Position along the rail, % of the cabinet width */
  x: number;
  /** Resting tilt, degrees */
  tilt: number;
  /** Sway either side of the tilt, degrees; the sign sets the starting direction */
  amp: number;
  /** Seconds for one swing */
  duration: number;
  garment: Garment;
  /** Muted fabric colour */
  fabric: string;
  /** Hidden on narrower screens so the rail never looks crowded */
  hideBelow?: 768 | 1100;
}

const HANGERS: HangerSpec[] = [
  { x: 8, tilt: -2, amp: 2.4, duration: 5.6, garment: "coat", fabric: "#c6b6a2" },
  { x: 17, tilt: 2, amp: -2.8, duration: 6.2, garment: "blouse", fabric: "#e6d3cb", hideBelow: 768 },
  { x: 26, tilt: -1, amp: 3, duration: 5.9, garment: "none", fabric: "", hideBelow: 1100 },
  { x: 35, tilt: 3, amp: -2.4, duration: 6.6, garment: "dress", fabric: "#c9b8a6" },
  { x: 47, tilt: -2, amp: 2.6, duration: 6, garment: "shirt", fabric: "#d9dcd2", hideBelow: 1100 },
  { x: 58, tilt: 1, amp: -3, duration: 5.7, garment: "blouse", fabric: "#ecdcc9" },
  { x: 69, tilt: -3, amp: 2.4, duration: 6.4, garment: "none", fabric: "", hideBelow: 768 },
  { x: 79, tilt: 2, amp: -2.6, duration: 6.1, garment: "dress", fabric: "#d8c3c0", hideBelow: 1100 },
  { x: 90, tilt: -1, amp: 2.8, duration: 5.8, garment: "coat", fabric: "#b8aa9c" },
];

// Sleeves drawn behind the body, and seams/collars drawn on top (same viewBox)
const SLEEVES: Partial<Record<Exclude<Garment, "none">, string>> = {
  blouse: "M-50 66 L-69 104 L-58 110 L-44 86 Z M50 66 L69 104 L58 110 L44 86 Z",
  shirt: "M-52 66 L-70 150 L-58 154 L-46 92 Z M52 66 L70 150 L58 154 L46 92 Z",
  coat: "M-56 66 L-74 196 L-60 200 L-48 96 Z M56 66 L74 196 L60 200 L48 96 Z",
};
const DETAILS: Record<Exclude<Garment, "none">, string> = {
  blouse: "M-16 68 Q0 86 16 68 M-40 150 Q0 156 40 150",
  shirt: "M-14 68 L0 90 L14 68 M0 90 L0 168 M-3 108 h6 M-3 128 h6 M-3 148 h6",
  dress: "M-46 108 Q0 116 46 108 M-22 112 L-34 222 M0 116 L0 228 M22 112 L34 222",
  coat: "M-16 74 L-6 132 M16 74 L6 132 M-12 150 h4 M-12 176 h4",
};

// Garment silhouettes hanging from the shoulders of a hanger (viewBox -70 -8 140 238)
const GARMENT_PATHS: Record<Exclude<Garment, "none">, string> = {
  blouse: "M-52 66 Q-62 72 -64 96 L-60 150 Q0 160 60 150 L64 96 Q62 72 52 66 Q26 80 0 82 Q-26 80 -52 66 Z",
  shirt: "M-54 66 Q-64 74 -64 100 L-62 170 Q0 178 62 170 L64 100 Q64 74 54 66 L14 78 L0 96 L-14 78 Z",
  dress: "M-44 66 Q-52 76 -48 104 L-72 226 Q0 236 72 226 L48 104 Q52 76 44 66 Q22 80 0 82 Q-22 80 -44 66 Z",
  coat: "M-58 66 Q-70 74 -68 104 L-64 222 Q0 230 64 222 L68 104 Q70 74 58 66 L16 76 L4 222 L-4 222 L-16 76 Z",
};

function Hanger({ spec, index }: { spec: HangerSpec; index: number }) {
  const style = {
    left: `${spec.x}%`,
    "--tilt": `${spec.tilt}deg`,
    "--amp": `${spec.amp}deg`,
    animationDuration: `${spec.duration}s`,
    animationDelay: `${-index * 0.5}s`, // staggered, already in motion on load
  } as CSSProperties;
  return (
    <div className={`wardrobe-hanger${spec.hideBelow ? ` hide-below-${spec.hideBelow}` : ""}`} style={style}>
      <svg viewBox="-70 -8 140 238" focusable="false">
        <defs>
          <linearGradient id={`wh-fabric-${index}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={spec.fabric || "#000"} stopOpacity="1" />
            <stop offset="1" stopColor={spec.fabric || "#000"} stopOpacity="0.82" />
          </linearGradient>
        </defs>
        {spec.garment !== "none" && (
          <>
            {SLEEVES[spec.garment] && <path d={SLEEVES[spec.garment]} fill={spec.fabric} opacity="0.85" />}
            <path d={GARMENT_PATHS[spec.garment]} fill={`url(#wh-fabric-${index})`} />
            {/* soft fold shadow, then seams and collar */}
            <path d={GARMENT_PATHS[spec.garment]} fill="url(#wardrobe-fold)" />
            <path d={DETAILS[spec.garment]} fill="none" stroke="#3b2a1c" strokeOpacity="0.12" strokeWidth="1.6" strokeLinecap="round" />
          </>
        )}
        <g fill="none" stroke="url(#wardrobe-gold)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M0 24 L0 10 C0 0 12 -3 13 5 C13.6 10 8 12 6 9" />
          <path d="M-2 28 L-58 64 Q-65 69 -56 70 L56 70 Q65 69 58 64 L2 28" />
        </g>
      </svg>
    </div>
  );
}

export default function ClosetBackdrop() {
  // Decided once per mount: open with an animation on the first visit of the session
  const [animateDoors] = useState(firstVisitThisSession);

  return (
    <div className={`wardrobe-scene${animateDoors ? " doors-animate" : ""}`} aria-hidden="true">
      {/* Shared paint servers for all hangers */}
      <svg className="wardrobe-defs" width="0" height="0" focusable="false">
        <defs>
          <linearGradient id="wardrobe-gold" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0" stopColor="#ecd59a" />
            <stop offset="0.5" stopColor="#c49a4e" />
            <stop offset="1" stopColor="#e2c27d" />
          </linearGradient>
          <linearGradient id="wardrobe-fold" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#3b2a1c" stopOpacity="0.16" />
            <stop offset="0.35" stopColor="#3b2a1c" stopOpacity="0" />
            <stop offset="0.7" stopColor="#3b2a1c" stopOpacity="0.04" />
            <stop offset="1" stopColor="#3b2a1c" stopOpacity="0.18" />
          </linearGradient>
        </defs>
      </svg>

      <div className="wardrobe-interior">
        <div className="wardrobe-rail" />
        <div className="wardrobe-hangers">
          {HANGERS.map((h, i) => (
            <Hanger key={h.x} spec={h} index={i} />
          ))}
        </div>
        <div className="wardrobe-shelf">
          <span className="wardrobe-stack wardrobe-stack--a" />
          <span className="wardrobe-stack wardrobe-stack--b" />
          <span className="wardrobe-stack wardrobe-stack--c" />
        </div>
      </div>

      <div className="wardrobe-frame" />

      <div className="wardrobe-doors">
        <div className="wardrobe-door wardrobe-door--left">
          <span className="wardrobe-door-panel" />
          <span className="wardrobe-door-panel" />
          <span className="wardrobe-handle" />
        </div>
        <div className="wardrobe-door wardrobe-door--right">
          <span className="wardrobe-door-panel" />
          <span className="wardrobe-door-panel" />
          <span className="wardrobe-handle" />
        </div>
      </div>

      {/* Keeps the user's clothes, text and controls dominant */}
      <div className="wardrobe-veil" />
    </div>
  );
}
