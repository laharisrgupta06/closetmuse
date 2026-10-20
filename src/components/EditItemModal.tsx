/**
 * EditItemModal.tsx
 * Modal dialog for inspecting and editing a wardrobe item's metadata.
 */
import { useState } from "react";
import type { FormEvent } from "react";
import { X, Check, Trash2, Loader2, AlertCircle } from "lucide-react";
import type { WardrobeItem, GarmentCategory, GarmentOccasion, GarmentStyle } from "../types";
import { updateWardrobeItem, deleteWardrobeItem } from "../services/wardrobeService";
import { getNormalizedCategory } from "../utils/category";
import "../App.css";

const CATEGORIES: { value: GarmentCategory; label: string }[] = [
  { value: "tops", label: "Tops" },
  { value: "bottoms", label: "Bottoms" },
  { value: "dresses", label: "Dresses" },
  { value: "outerwear", label: "Outerwear" },
  { value: "footwear", label: "Footwear" },
  { value: "accessories", label: "Accessories" },
  { value: "bags", label: "Bags" },
  { value: "jewellery", label: "Jewellery" },
  { value: "other", label: "Other" },
];

const OCCASIONS: { value: GarmentOccasion; label: string }[] = [
  { value: "everyday", label: "Everyday" },
  { value: "work", label: "Work" },
  { value: "casual", label: "Casual" },
  { value: "formal", label: "Formal" },
  { value: "evening", label: "Evening" },
  { value: "occasion", label: "Occasion" },
  { value: "active", label: "Active" },
  { value: "beach", label: "Beach" },
  { value: "travel", label: "Travel" },
];

const STYLES: { value: GarmentStyle; label: string }[] = [
  { value: "classic", label: "Classic" },
  { value: "minimalist", label: "Minimalist" },
  { value: "bohemian", label: "Bohemian" },
  { value: "preppy", label: "Preppy" },
  { value: "streetwear", label: "Streetwear" },
  { value: "romantic", label: "Romantic" },
  { value: "edgy", label: "Edgy" },
  { value: "sophisticated", label: "Sophisticated" },
  { value: "eclectic", label: "Eclectic" },
];

const STYLE_BRANCHES = ["Traditional", "Indo-Western", "Western", "Unknown"];

interface EditItemModalProps {
  item: WardrobeItem;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (updatedItem: WardrobeItem) => void;
  onDeleted: (itemId: string) => void;
}

export default function EditItemModal({
  item,
  isOpen,
  onClose,
  onUpdated,
  onDeleted,
}: EditItemModalProps) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState<GarmentCategory>(getNormalizedCategory(item));
  const [styleBranch, setStyleBranch] = useState(item.style_branch ?? "");
  const [subcategory, setSubcategory] = useState(item.subcategory ?? "");
  const [color, setColor] = useState(item.color ?? "");
  const [material, setMaterial] = useState(item.material ?? "");
  const [pattern, setPattern] = useState(item.pattern ?? "");
  const [occasion, setOccasion] = useState<GarmentOccasion | "">((item.occasion as GarmentOccasion) ?? "");
  const [style, setStyle] = useState<GarmentStyle | "">((item.style as GarmentStyle) ?? "");
  const [brand, setBrand] = useState(item.brand ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateWardrobeItem(item.id, {
        name,
        category,
        style_branch: styleBranch || undefined,
        subcategory: subcategory || undefined,
        color: color || undefined,
        material: material || undefined,
        pattern: pattern || undefined,
        occasion: occasion || undefined,
        style: style || undefined,
        brand: brand || undefined,
        notes: notes || undefined,
      });
      onUpdated(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update item.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to remove "${item.name}" from your wardrobe?`)) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteWardrobeItem(item.id, item.image_url);
      onDeleted(item.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete item.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(30, 20, 15, 0.6)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 620,
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--cream)",
          padding: 24,
          position: "relative",
          boxShadow: "var(--shadow-xl)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
            paddingBottom: 14,
            borderBottom: "1px solid var(--border-light)",
          }}
        >
          <div>
            <div className="eyebrow">Edit Wardrobe Item</div>
            <h2 style={{ fontSize: 20, margin: 0, fontFamily: "var(--font-serif)" }}>
              {item.name}
            </h2>
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              background: "var(--rose-pale)",
              color: "var(--espresso)",
              borderRadius: "var(--r-md)",
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            <AlertCircle size={15} style={{ color: "var(--rose)" }} />
            {error}
          </div>
        )}

        {/* Content & Form */}
        <form onSubmit={handleSave}>
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 20, marginBottom: 20 }}>
            {/* Image Preview */}
            <div
              style={{
                width: 140,
                height: 180,
                borderRadius: "var(--r-lg)",
                overflow: "hidden",
                background: "var(--cream-dark)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.name}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              ) : (
                <div style={{ fontSize: 12, color: "var(--brown-muted)" }}>No image</div>
              )}
            </div>

            {/* Main inputs */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Garment Name *</label>
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Category</label>
                  <select
                    className="form-select"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as GarmentCategory)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Branch</label>
                  <select
                    className="form-select"
                    value={styleBranch}
                    onChange={(e) => setStyleBranch(e.target.value)}
                  >
                    <option value="">Select branch</option>
                    {STYLE_BRANCHES.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Subcategory / Type</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Saree, Kurti, Jeans"
                  value={subcategory}
                  onChange={(e) => setSubcategory(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Additional Fashion Attributes */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Colour</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Emerald Green, Navy"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Material</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Silk, Denim, Cotton"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Pattern</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Solid, Floral, Embroidered"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Occasion</label>
              <select
                className="form-select"
                value={occasion}
                onChange={(e) => setOccasion(e.target.value as GarmentOccasion)}
              >
                <option value="">Select occasion</option>
                {OCCASIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Style</label>
              <select
                className="form-select"
                value={style}
                onChange={(e) => setStyle(e.target.value as GarmentStyle)}
              >
                <option value="">Select style</option>
                {STYLES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Brand</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Zara, FabIndia"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 24 }}>
            <label className="form-label">Notes</label>
            <textarea
              className="form-textarea"
              rows={2}
              placeholder="Care instructions, styling ideas..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ color: "var(--rose)" }}
              onClick={handleDelete}
              disabled={deleting || saving}
            >
              {deleting ? (
                <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />Deleting…</>
              ) : (
                <><Trash2 size={13} />Delete</>
              )}
            </button>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={saving || !name.trim()}
              >
                {saving ? (
                  <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />Saving…</>
                ) : (
                  <><Check size={13} />Save Changes</>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
