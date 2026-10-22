/**
 * SavedOutfitModal.tsx
 * Interactive detailed view of a saved outfit, displaying full-size previews
 * of all garments/accessories, taxonomy details, occasion, and actions to load or delete.
 */
import { X, Sparkles, Trash2, Calendar, Tag } from "lucide-react";
import type { SavedOutfit } from "../services/outfitService";
import { getNormalizedCategory } from "../utils/category";
import "../App.css";
import { formatItemNumber, formatOutfitNumber } from "../utils/numbering";

interface SavedOutfitModalProps {
  outfit: SavedOutfit | null;
  isOpen: boolean;
  onClose: () => void;
  onLoad: (outfit: SavedOutfit) => void;
  onDelete: (outfitId: string) => void;
}

export default function SavedOutfitModal({
  outfit,
  isOpen,
  onClose,
  onLoad,
  onDelete,
}: SavedOutfitModalProps) {
  if (!isOpen || !outfit) return null;

  const validItems = Array.isArray(outfit.items)
    ? outfit.items.filter((it) => Boolean(it))
    : [];

  const formattedDate = outfit.created_at
    ? new Date(outfit.created_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(30, 20, 15, 0.65)",
        backdropFilter: "blur(6px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="saved-outfit-modal-title"
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 640,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--white)",
          borderRadius: "var(--r-xl)",
          overflow: "hidden",
          boxShadow: "var(--shadow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px 16px",
            borderBottom: "1px solid var(--border-light)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }} id="saved-outfit-number">
              {formatOutfitNumber(outfit.outfit_number)
                ? `${formatOutfitNumber(outfit.outfit_number)} · Saved outfit`
                : "Saved Outfit Details"}
            </div>
            <h2
              id="saved-outfit-modal-title"
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: "var(--espresso)",
                lineHeight: 1.25,
                margin: 0,
              }}
            >
              {outfit.name}
            </h2>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginTop: 6,
                fontSize: 12,
                color: "var(--brown-muted)",
              }}
            >
              {outfit.occasion && (
                <span
                  className="saved-outfit-badge"
                  style={{ textTransform: "capitalize" }}
                >
                  <Tag size={11} style={{ display: "inline", marginRight: 4 }} />
                  {outfit.occasion}
                </span>
              )}
              <span>{validItems.length} items</span>
              {formattedDate && (
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Calendar size={12} />
                  {formattedDate}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close dialog"
            style={{ color: "var(--brown-muted)" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div
          style={{
            padding: "20px 24px",
            overflowY: "auto",
            flex: 1,
          }}
        >
          {outfit.styling_notes && (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: "var(--r-md)",
                backgroundColor: "var(--cream)",
                fontSize: 13,
                color: "var(--brown-soft)",
                marginBottom: 20,
                fontStyle: "italic",
                borderLeft: "3px solid var(--terracotta)",
              }}
            >
              "{outfit.styling_notes}"
            </div>
          )}

          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              color: "var(--brown-muted)",
              marginBottom: 12,
            }}
          >
            Outfit Pieces ({validItems.length})
          </div>

          {validItems.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "30px 16px",
                color: "var(--brown-muted)",
                fontSize: 13,
              }}
            >
              The items in this outfit were removed or are unavailable.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: 16,
              }}
            >
              {validItems.map((item, idx) => {
                const normalizedCategory = getNormalizedCategory(item);
                return (
                  <div
                    key={item.id || idx}
                    style={{
                      border: "1px solid var(--border-light)",
                      borderRadius: "var(--r-lg)",
                      padding: 10,
                      backgroundColor: "var(--white)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      textAlign: "center",
                      transition: "box-shadow 0.2s var(--ease)",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "1 / 1",
                        borderRadius: "var(--r-md)",
                        backgroundColor: "var(--cream)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        marginBottom: 10,
                      }}
                    >
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          style={{
                            maxWidth: "92%",
                            maxHeight: "92%",
                            objectFit: "contain",
                          }}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--brown-muted)", textTransform: "capitalize" }}>
                          {normalizedCategory}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--espresso)",
                        lineHeight: 1.25,
                        width: "100%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={item.name}
                    >
                      {formatItemNumber(item.item_number) && (
                        <span className="item-number">{formatItemNumber(item.item_number)} </span>
                      )}
                      {item.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--brown-muted)",
                        marginTop: 3,
                        textTransform: "capitalize",
                      }}
                    >
                      {item.subcategory || normalizedCategory}
                      {item.color ? ` • ${item.color}` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border-light)",
            backgroundColor: "var(--cream-light, #faf8f5)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ color: "#c62828", borderColor: "rgba(211,47,47,0.3)" }}
            onClick={() => {
              if (confirm(`Are you sure you want to delete "${outfit.name}"?`)) {
                onDelete(outfit.id);
                onClose();
              }
            }}
          >
            <Trash2 size={14} />
            Delete Outfit
          </button>

          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                onLoad(outfit);
                onClose();
              }}
            >
              <Sparkles size={14} />
              Wear / Load Look
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
