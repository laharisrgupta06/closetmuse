import type { ReactNode } from "react";
import { Heart, Plus, Edit2, Trash2 } from "lucide-react";
import type { WardrobeItem } from "../types";
import { getNormalizedCategory } from "../utils/category";

interface WardrobeCardProps {
  item: WardrobeItem;
  onFavorite?: (id: string) => void;
  onSelect?: (item: WardrobeItem) => void;
  onEdit?: (item: WardrobeItem) => void;
  onDelete?: (item: WardrobeItem) => void;
  /** Clicking the card opens the item (details view) */
  onOpen?: (item: WardrobeItem) => void;
  selected?: boolean;
  selectable?: boolean;
  /** Extra content under the item details (e.g. who shared it in a Room) */
  footer?: ReactNode;
}

export default function WardrobeCard({
  item,
  onFavorite,
  onSelect,
  onEdit,
  onDelete,
  onOpen,
  selected = false,
  selectable = false,
  footer,
}: WardrobeCardProps) {
  const handleClick = () => {
    if (selectable) {
      onSelect?.(item);
    } else if (onOpen) {
      onOpen(item);
    } else if (onEdit) {
      onEdit(item);
    }
  };
  const clickable = selectable || Boolean(onOpen) || Boolean(onEdit);

  return (
    <div
      className={`wardrobe-card${selected ? " selected" : ""}`}
      style={
        selected
          ? { outline: "2px solid var(--espresso)", outlineOffset: "2px" }
          : { cursor: clickable ? "pointer" : "default" }
      }
      onClick={handleClick}
      role={clickable ? "button" : undefined}
      aria-label={clickable ? `${item.name}: view details` : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
    >
      <div className="wardrobe-card-image">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} loading="lazy" />
        ) : (
          <svg
            className="wardrobe-card-placeholder"
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
        )}

        <div className="wardrobe-card-actions">
          {onEdit && !selectable && (
            <button
              className="card-action-btn"
              aria-label="Edit item metadata"
              title="Edit item"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(item);
              }}
            >
              <Edit2 size={13} />
            </button>
          )}

          {onDelete && !selectable && (
            <button
              className="card-action-btn"
              aria-label="Delete item"
              title="Delete item"
              style={{ color: "#d32f2f" }}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item);
              }}
            >
              <Trash2 size={13} />
            </button>
          )}

          {onFavorite && (
            <button
              className={`card-action-btn${item.is_favorite ? " favorited" : ""}`}
              aria-label={
                item.is_favorite ? "Remove from favourites" : "Add to favourites"
              }
              onClick={(e) => {
                e.stopPropagation();
                onFavorite(item.id);
              }}
            >
              <Heart size={15} fill={item.is_favorite ? "currentColor" : "none"} />
            </button>
          )}

          {selectable && (
            <button
              className="card-action-btn"
              aria-label="Select item"
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(item);
              }}
            >
              <Plus size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="wardrobe-card-info">
        <div className="wardrobe-card-name">{item.name}</div>
        <div className="wardrobe-card-meta">
          {item.style_branch ? `${item.style_branch} • ` : ""}
          {item.subcategory || getNormalizedCategory(item)}
          {item.color ? ` • ${item.color}` : ""}
        </div>
        {footer}
      </div>
    </div>
  );
}

/* ─── Skeleton ──────────────────────────────────────────────── */
export function WardrobeCardSkeleton() {
  return (
    <div className="wardrobe-card" style={{ pointerEvents: "none" }}>
      <div className="wardrobe-card-image skeleton skeleton-card" />
      <div className="wardrobe-card-info">
        <div className="skeleton skeleton-text" />
        <div className="skeleton skeleton-text skeleton-text-short" />
      </div>
    </div>
  );
}
