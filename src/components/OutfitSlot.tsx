import { Plus } from "lucide-react";
import type { GarmentCategory } from "../types";

import { getNormalizedCategory } from "../utils/category";
import { formatItemNumber } from "../utils/numbering";

interface OutfitSlotProps {
  category: GarmentCategory;
  label: string;
  filledItem?: {
    name: string;
    category: string;
    subcategory?: string;
    image_url?: string;
    item_number?: number | null;
  };
  onAdd?: () => void;
  onRemove?: () => void;
}

export default function OutfitSlot({
  category: _category,
  label,
  filledItem,
  onAdd,
  onRemove,
}: OutfitSlotProps) {
  if (filledItem) {
    const displayCat = getNormalizedCategory({
      category: filledItem.category,
      subcategory: filledItem.subcategory,
      name: filledItem.name,
    });

    return (
      <div
        className="outfit-slot filled"
        onClick={onRemove}
        title="Click to remove"
      >
        <div className="slot-thumb">
          {filledItem.image_url ? (
            <img src={filledItem.image_url} alt={filledItem.name} />
          ) : null}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="slot-filled-name truncate">{filledItem.name}</div>
          <div className="slot-filled-meta">
            {formatItemNumber(filledItem.item_number) && (
              <span className="item-number">{formatItemNumber(filledItem.item_number)} · </span>
            )}
            <span style={{ textTransform: "capitalize" }}>{displayCat}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="outfit-slot" onClick={onAdd}>
      <div className="slot-add-icon">
        <Plus size={16} />
      </div>
      <span className="slot-label">{label}</span>
    </div>
  );
}
