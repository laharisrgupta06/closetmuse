/**
 * OutfitBoard.tsx
 * Shows a complete outfit at a glance: garments in one zone, finishing
 * touches (footwear, bag, jewellery, accessories) in a compact zone beside
 * them. Images are never cropped; each frame's shape suits the piece type.
 */
import type { WardrobeItem } from "../types";
import { getNormalizedCategory } from "../utils/category";

export interface BoardPiece {
  item: WardrobeItem;
  /** Role from the stylist ("dress", "footwear"…); derived from the category if absent */
  slot?: string;
  reason?: string;
}

const SLOT_FROM_CATEGORY: Record<string, string> = {
  dresses: "dress",
  tops: "top",
  bottoms: "bottom",
  outerwear: "layer",
  footwear: "footwear",
  bags: "bag",
  jewellery: "jewellery",
  accessories: "accessory",
  other: "other",
};

const SLOT_LABELS: Record<string, string> = {
  dress: "Dress / Saree",
  top: "Top",
  bottom: "Bottom",
  layer: "Layer",
  footwear: "Footwear",
  bag: "Bag",
  jewellery: "Jewellery",
  accessory: "Accessory",
  other: "Other",
};

const ORDER = ["dress", "top", "bottom", "layer", "footwear", "bag", "jewellery", "accessory", "other"];
const GARMENT_SLOTS = new Set(["dress", "top", "bottom", "layer"]);

function slotFor(piece: BoardPiece): string {
  if (piece.slot && SLOT_LABELS[piece.slot]) return piece.slot;
  return SLOT_FROM_CATEGORY[getNormalizedCategory(piece.item)] ?? "other";
}

function Piece({ piece, slot }: { piece: BoardPiece; slot: string }) {
  const { item, reason } = piece;
  return (
    <figure className={`outfit-piece outfit-piece--${slot}`}>
      <div className="outfit-piece-frame">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} loading="lazy" />
        ) : (
          <span className="outfit-piece-noimage">No photo</span>
        )}
      </div>
      <figcaption>
        <span className="outfit-piece-slot">{SLOT_LABELS[slot]}</span>
        <span className="outfit-piece-name" title={item.name}>{item.name}</span>
        {reason && (
          <span className="outfit-piece-reason" title={reason}>
            {reason}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

export default function OutfitBoard({
  pieces,
  missing = [],
}: {
  pieces: BoardPiece[];
  missing?: { slot: string; note: string }[];
}) {
  const sorted = pieces
    .map((p) => ({ piece: p, slot: slotFor(p) }))
    .sort((a, b) => ORDER.indexOf(a.slot) - ORDER.indexOf(b.slot));
  const garments = sorted.filter((p) => GARMENT_SLOTS.has(p.slot));
  const extras = sorted.filter((p) => !GARMENT_SLOTS.has(p.slot));
  const single = garments.length === 0 || extras.length === 0;

  return (
    <div className="outfit-board-wrap">
      <div className={`outfit-board${single ? " outfit-board--single" : ""}`}>
        {garments.length > 0 && (
          <section>
            <div className="outfit-board-heading">Outfit</div>
            <div className="outfit-board-main">
              {garments.map(({ piece, slot }) => (
                <Piece key={piece.item.id} piece={piece} slot={slot} />
              ))}
            </div>
          </section>
        )}
        {extras.length > 0 && (
          <section>
            <div className="outfit-board-heading">Finishing touches</div>
            <div className="outfit-board-extras">
              {extras.map(({ piece, slot }) => (
                <Piece key={piece.item.id} piece={piece} slot={slot} />
              ))}
            </div>
          </section>
        )}
      </div>

      {missing.length > 0 && (
        <div className="outfit-board-missing">
          <div className="outfit-board-heading">Left out of this look</div>
          <ul>
            {missing.map((m) => (
              <li key={m.slot}>
                <strong>{SLOT_LABELS[m.slot] ?? m.slot}:</strong> {m.note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
