import type { CSSProperties } from "react";

/**
 * Decorative wardrobe scene behind the My Closet header: a warm wash, an
 * arched alcove with a rail of gold hangers (each swaying gently on its own
 * timing), and a small shelf of folded knits. Purely decorative: hidden from
 * assistive technology, never interactive, and kept clear of the title and
 * header buttons by the layout in App.css. Swaying stops when the user
 * prefers reduced motion.
 */

// One hanger, pivot at the top of the hook (0,0)
function Hanger() {
  return (
    <>
      <path d="M0 24 L0 10 C0 0 12 -3 13 5 C13.6 10 8 12 6 9" />
      <circle cx="0" cy="26" r="2.4" />
      <path d="M-2 28 L-58 66 Q-65 71 -56 72 L56 72 Q65 71 58 66 L2 28" />
    </>
  );
}

// Soft garment silhouettes hanging from a hanger's shoulders (y ≈ 66–72)
const BLOUSE = "M-54 70 Q-60 74 -62 92 L-66 150 L66 150 L62 92 Q60 74 54 70 Q30 80 0 82 Q-30 80 -54 70 Z";
const DRESS = "M-46 70 Q-52 76 -50 96 L-74 150 L74 150 L50 96 Q52 76 46 70 Q24 82 0 84 Q-24 82 -46 70 Z";

interface HangerSpec {
  x: number;
  tilt: number;
  /** Sway amplitude; the sign sets the starting direction */
  amp: number;
  duration: number;
  garment?: { d: string; fill: string };
}

// Tilts vary in direction and size; sway is ±1.5–2° with 0.5 s staggered starts
const HANGERS: HangerSpec[] = [
  { x: 120, tilt: -8, amp: 1.8, duration: 4.6 },
  { x: 300, tilt: 6, amp: -1.6, duration: 5.2, garment: { d: BLOUSE, fill: "url(#cb-blush)" } },
  { x: 480, tilt: -4, amp: 2, duration: 4.9 },
  { x: 660, tilt: 9, amp: -1.7, duration: 5.5, garment: { d: DRESS, fill: "url(#cb-ivory)" } },
  { x: 830, tilt: -6, amp: 1.5, duration: 5 },
];

const RAIL_Y = 44;

export default function ClosetBackdrop() {
  return (
    <div className="closet-backdrop" aria-hidden="true">
      <div className="closet-backdrop-wash" />

      <svg className="closet-backdrop-alcove" viewBox="0 0 950 150" preserveAspectRatio="xMidYMin meet" focusable="false">
        <defs>
          <linearGradient id="cb-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f1deaa" />
            <stop offset="0.45" stopColor="#c9a35a" />
            <stop offset="0.7" stopColor="#a8823d" />
            <stop offset="1" stopColor="#e4cb8d" />
          </linearGradient>
          <linearGradient id="cb-panel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#efe5d3" />
            <stop offset="1" stopColor="#f6f1e8" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="cb-blush" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ead7cf" />
            <stop offset="1" stopColor="#ead7cf" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="cb-ivory" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e9dfcb" />
            <stop offset="1" stopColor="#e9dfcb" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Arched alcove: back panel and moulding */}
        <path d="M30 150 L30 48 Q30 10 70 10 L880 10 Q920 10 920 48 L920 150 Z" fill="url(#cb-panel)" />
        <path d="M30 150 L30 48 Q30 10 70 10 L880 10 Q920 10 920 48 L920 150" fill="none" stroke="#e2d2ad" strokeWidth="1.4" />
        <path d="M46 150 L46 54 Q46 24 78 24 L872 24 Q904 24 904 54 L904 150" fill="none" stroke="#ebdfc4" strokeWidth="1" />

        {/* Rail with end brackets */}
        <line x1="54" y1={RAIL_Y + 2} x2="896" y2={RAIL_Y + 2} stroke="#c9a35a" strokeWidth="2.2" strokeLinecap="round" />
        <rect x="50" y={RAIL_Y - 3} width="6" height="10" rx="2" fill="#d8bf87" />
        <rect x="894" y={RAIL_Y - 3} width="6" height="10" rx="2" fill="#d8bf87" />

        {HANGERS.map((h, i) => (
          <g key={h.x} transform={`translate(${h.x} ${RAIL_Y}) rotate(${h.tilt})`}>
            <g
              className="closet-hanger"
              style={
                {
                  "--amp": `${h.amp}deg`,
                  animationDuration: `${h.duration}s`,
                  animationDelay: `${i * 0.5}s`,
                } as CSSProperties
              }
            >
              {h.garment && <path d={h.garment.d} fill={h.garment.fill} />}
              <g fill="none" stroke="url(#cb-gold)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <Hanger />
              </g>
            </g>
          </g>
        ))}
      </svg>

      <svg className="closet-backdrop-shelf" viewBox="0 0 230 64" focusable="false">
        {/* Hat box */}
        <ellipse cx="44" cy="30" rx="30" ry="6" fill="#efe6d4" stroke="#e2d2ad" strokeWidth="1" />
        <path d="M14 30 L14 52 Q44 60 74 52 L74 30" fill="#f2ebdd" stroke="#e2d2ad" strokeWidth="1" />
        <path d="M14 38 Q44 46 74 38" fill="none" stroke="#e7d7b4" strokeWidth="1" />
        {/* Folded knits */}
        <rect x="104" y="44" width="92" height="12" rx="4" fill="#eadfd0" stroke="#e2d2ad" strokeWidth="0.8" />
        <rect x="108" y="32" width="86" height="12" rx="4" fill="#ede6d8" stroke="#e2d2ad" strokeWidth="0.8" />
        <rect x="112" y="21" width="80" height="11" rx="4" fill="#ecdcd3" stroke="#e2d2ad" strokeWidth="0.8" />
        <path d="M150 21 L150 56" stroke="#e5d6bd" strokeWidth="0.8" />
        {/* Shelf board */}
        <rect x="0" y="56" width="230" height="5" rx="2" fill="#e8dcc2" />
      </svg>
    </div>
  );
}
