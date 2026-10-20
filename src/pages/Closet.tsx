import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  SlidersHorizontal,
  Heart,
  Shirt,
  Wand2,
  Save,
  RefreshCw,
  Trash2,
  Check,
  AlertCircle,
  Loader2,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import Navbar from "../components/Navbar";
import EmptyState from "../components/EmptyState";
import WardrobeCard, { WardrobeCardSkeleton } from "../components/WardrobeCard";
import OutfitSlot from "../components/OutfitSlot";
import type { WardrobeItem, GarmentCategory, GarmentOccasion, LoadingState } from "../types";
import { fetchAllWardrobeItems, deleteWardrobeItem } from "../services/wardrobeService";
import {
  saveOutfit,
  fetchSavedOutfits,
  deleteSavedOutfit,
  type SavedOutfit,
} from "../services/outfitService";
import EditItemModal from "../components/EditItemModal";
import SavedOutfitModal from "../components/SavedOutfitModal";
import { getNormalizedCategory } from "../utils/category";
import "../App.css";

const CATEGORY_FILTERS: { value: GarmentCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "tops", label: "Tops" },
  { value: "bottoms", label: "Bottoms" },
  { value: "dresses", label: "Dresses" },
  { value: "outerwear", label: "Outerwear" },
  { value: "footwear", label: "Footwear" },
  { value: "bags", label: "Bags" },
  { value: "jewellery", label: "Jewellery" },
  { value: "accessories", label: "Accessories" },
];

const OUTFIT_SLOTS: { category: GarmentCategory; label: string }[] = [
  { category: "dresses", label: "Dress / One-Piece" },
  { category: "tops", label: "Top" },
  { category: "bottoms", label: "Bottom" },
  { category: "outerwear", label: "Outerwear" },
  { category: "footwear", label: "Footwear" },
  { category: "bags", label: "Bag" },
  { category: "jewellery", label: "Jewellery" },
  { category: "accessories", label: "Accessories" },
];

const OCCASIONS: { value: GarmentOccasion; label: string }[] = [
  { value: "everyday", label: "Everyday" },
  { value: "work", label: "Work / College" },
  { value: "casual", label: "Casual" },
  { value: "formal", label: "Formal" },
  { value: "evening", label: "Evening" },
  { value: "occasion", label: "Festive / Occasion" },
  { value: "active", label: "Active" },
  { value: "beach", label: "Beach" },
  { value: "travel", label: "Travel" },
];

const QUICK_SUGGESTIONS = [
  "Beach Outfit 1",
  "Beach Outfit 2",
  "Navratri Outfit 1",
  "College Outfit 1",
  "Casual Look 1",
  "Evening Glam 1",
];

type ActiveTab = "closet" | "outfits" | "saved_outfits";

export default function Closet() {
  const navigate = useNavigate();

  // Navigation & filtering state
  const [activeTab, setActiveTab] = useState<ActiveTab>("closet");
  const [activeFilter, setActiveFilter] = useState<GarmentCategory | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Real data from Supabase
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>("loading");
  const [editingItem, setEditingItem] = useState<WardrobeItem | null>(null);

  // Outfit builder state
  const [outfitSlots, setOutfitSlots] = useState<
    Partial<Record<GarmentCategory, WardrobeItem>>
  >({});
  const [outfitName, setOutfitName] = useState("");
  const [selectedOccasion, setSelectedOccasion] = useState<GarmentOccasion | "">("");

  // Saved outfits collection state
  const [savedOutfits, setSavedOutfits] = useState<SavedOutfit[]>([]);
  const [loadingSavedOutfits, setLoadingSavedOutfits] = useState(false);
  const [savedOccasionFilter, setSavedOccasionFilter] = useState<string>("all");
  const [selectedSavedOutfit, setSelectedSavedOutfit] = useState<SavedOutfit | null>(null);

  const [saveState, setSaveState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadItems = useCallback(async () => {
    setLoadingState("loading");
    try {
      const data = await fetchAllWardrobeItems();
      setItems(data);
      setLoadingState("success");
    } catch (err) {
      console.error("Failed to load wardrobe items:", err);
      setLoadingState("error");
    }
  }, []);

  const loadSaved = useCallback(async () => {
    setLoadingSavedOutfits(true);
    try {
      const data = await fetchSavedOutfits();
      setSavedOutfits(data);
    } catch (err) {
      console.warn("Could not load saved outfits:", err);
    } finally {
      setLoadingSavedOutfits(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
    loadSaved();
  }, [loadItems, loadSaved]);

  const handleRemoveSlot = useCallback((category: GarmentCategory) => {
    setOutfitSlots((prev) => {
      const next = { ...prev };
      delete next[category];
      return next;
    });
  }, []);

  const handleToggleItemSelection = (item: WardrobeItem) => {
    const slotCat = getNormalizedCategory(item);
    setOutfitSlots((prev) => {
      // If this exact item is currently selected in its category slot, unselect it
      if (prev[slotCat]?.id === item.id) {
        const next = { ...prev };
        delete next[slotCat];
        return next;
      }
      // Otherwise, select ONLY this item for its category
      return {
        ...prev,
        [slotCat]: item,
      };
    });
  };

  const handleDeleteItem = async (item: WardrobeItem) => {
    if (!confirm(`Are you sure you want to permanently delete "${item.name}"?`)) {
      return;
    }
    try {
      await deleteWardrobeItem(item.id, item.image_url);
      setItems((prev) => prev.filter((it) => it.id !== item.id));

      // Remove from outfit slots if selected
      const cat = getNormalizedCategory(item);
      setOutfitSlots((prev) => {
        if (prev[cat]?.id === item.id) {
          const next = { ...prev };
          delete next[cat];
          return next;
        }
        return prev;
      });

      // Remove from saved outfits in memory
      setSavedOutfits((prev) =>
        prev.map((o) => ({
          ...o,
          items: o.items.filter((it) => it.id !== item.id),
          item_ids: o.item_ids.filter((id) => id !== item.id),
        }))
      );

      setFeedbackMsg({
        type: "success",
        text: `"${item.name}" deleted from your wardrobe.`,
      });
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete item.";
      alert(msg);
    }
  };

  const handleSaveOutfit = async () => {
    const selectedItems = Object.values(outfitSlots).filter((it): it is WardrobeItem => Boolean(it));
    if (selectedItems.length === 0) return;

    setSaveState("saving");
    setFeedbackMsg(null);

    try {
      const finalName =
        outfitName.trim() ||
        [selectedOccasion ? `${selectedOccasion.charAt(0).toUpperCase() + selectedOccasion.slice(1)} Outfit` : "", "Look"]
          .filter(Boolean)
          .join(" ") ||
        "Curated Look 1";

      const saved = await saveOutfit({
        name: finalName,
        occasion: selectedOccasion || undefined,
        items: selectedItems,
      });

      setSavedOutfits((prev) => [saved, ...prev.filter((o) => o.id !== saved.id)]);
      setSaveState("success");
      setFeedbackMsg({
        type: "success",
        text: `Outfit "${saved.name}" saved successfully!`,
      });

      setTimeout(() => {
        setSaveState("idle");
        setFeedbackMsg(null);
      }, 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save outfit.";
      setSaveState("error");
      setFeedbackMsg({ type: "error", text: msg });
    }
  };

  const handleLoadOutfit = (outfit: SavedOutfit) => {
    const newSlots: Partial<Record<GarmentCategory, WardrobeItem>> = {};
    for (const it of outfit.items) {
      if (it) {
        const slotCat = getNormalizedCategory(it);
        newSlots[slotCat] = it;
      }
    }
    setOutfitSlots(newSlots);
    setOutfitName(outfit.name);
    setSelectedOccasion((outfit.occasion as GarmentOccasion) || "");
    setActiveTab("outfits"); // Switch to Outfit Builder so user can immediately view/edit
    setFeedbackMsg({
      type: "success",
      text: `Loaded "${outfit.name}" into Outfit Builder.`,
    });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleDeleteOutfit = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await deleteSavedOutfit(id);
      setSavedOutfits((prev) => prev.filter((o) => o.id !== id));
      if (selectedSavedOutfit?.id === id) {
        setSelectedSavedOutfit(null);
      }
    } catch (err) {
      console.error("Failed to delete outfit:", err);
    }
  };

  const handleClearOutfit = () => {
    setOutfitSlots({});
    setOutfitName("");
    setSelectedOccasion("");
  };

  // Filter items using normalized taxonomy
  const filteredItems =
    activeFilter === "all"
      ? items
      : items.filter((item) => getNormalizedCategory(item) === activeFilter);

  const searchedItems = searchQuery
    ? filteredItems.filter((item) => {
        const normalized = getNormalizedCategory(item);
        return (
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          normalized.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.color?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.subcategory?.toLowerCase().includes(searchQuery.toLowerCase())
        );
      })
    : filteredItems;

  const outfitHasItems = Object.keys(outfitSlots).length > 0;

  const filteredSavedOutfits =
    savedOccasionFilter === "all"
      ? savedOutfits
      : savedOutfits.filter((o) => o.occasion?.toLowerCase() === savedOccasionFilter.toLowerCase());

  return (
    <div className="app-shell">
      <Navbar />

      <main className="page-content">
        <div className="page">
          {/* Page Header */}
          <div className="page-header">
            <div className="page-header-left">
              <div className="eyebrow">My Wardrobe</div>
              <h1 className="page-title">My Closet</h1>
            </div>
            <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => navigate("/build")}
              >
                <Shirt size={14} />
                Add Item
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => navigate("/stylist")}
              >
                <Wand2 size={14} />
                Style Me
              </button>
            </div>
          </div>

          {/* 3 Top-Level Tabs: [ Wardrobe ] [ Outfit Builder ] [ Saved Outfits ] */}
          <div className="tab-bar">
            <button
              className={`tab-item${activeTab === "closet" ? " active" : ""}`}
              onClick={() => setActiveTab("closet")}
              id="tab-wardrobe"
            >
              Wardrobe
            </button>
            <button
              className={`tab-item${activeTab === "outfits" ? " active" : ""}`}
              onClick={() => setActiveTab("outfits")}
              id="tab-outfit-builder"
            >
              Outfit Builder
            </button>
            <button
              className={`tab-item${activeTab === "saved_outfits" ? " active" : ""}`}
              onClick={() => {
                setActiveTab("saved_outfits");
                loadSaved();
              }}
              id="tab-saved-outfits"
            >
              Saved Outfits {savedOutfits.length > 0 && `(${savedOutfits.length})`}
            </button>
          </div>

          {/* ── TAB 1: WARDROBE ── */}
          {activeTab === "closet" && (
            <>
              {/* Filter bar */}
              <div className="filter-bar">
                <div className="filter-bar-left">
                  <div className="search-input-wrap">
                    <Search className="search-icon" size={15} />
                    <input
                      className="search-input"
                      type="search"
                      placeholder="Search your wardrobe..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      aria-label="Search wardrobe"
                    />
                  </div>
                </div>

                <div className="filter-chips">
                  {CATEGORY_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      className={`filter-chip${activeFilter === f.value ? " active" : ""}`}
                      onClick={() => setActiveFilter(f.value)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <button className="btn btn-secondary btn-sm">
                  <SlidersHorizontal size={14} />
                  Sort
                </button>
              </div>

              {/* Feedback toast */}
              {feedbackMsg && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--r-md)",
                    marginBottom: 16,
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background:
                      feedbackMsg.type === "success"
                        ? "rgba(46, 125, 50, 0.1)"
                        : "rgba(211, 47, 47, 0.1)",
                    color: feedbackMsg.type === "success" ? "#2e7d32" : "#c62828",
                    border: `1px solid ${
                      feedbackMsg.type === "success"
                        ? "rgba(46, 125, 50, 0.25)"
                        : "rgba(211, 47, 47, 0.25)"
                    }`,
                  }}
                >
                  <Check size={14} />
                  <span>{feedbackMsg.text}</span>
                </div>
              )}

              {/* Content */}
              {loadingState === "loading" ? (
                <div className="item-grid">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <WardrobeCardSkeleton key={i} />
                  ))}
                </div>
              ) : loadingState === "error" ? (
                <EmptyState
                  icon={Shirt}
                  title="Unable to load wardrobe"
                  description="Something went wrong loading your items. Please try again."
                  action={
                    <button className="btn btn-secondary btn-sm" onClick={loadItems}>
                      <RefreshCw size={13} />
                      Retry
                    </button>
                  }
                />
              ) : searchedItems.length === 0 && items.length === 0 ? (
                <EmptyState
                  icon={Shirt}
                  title="Your closet is empty"
                  description="Add your first garment to start building your digital wardrobe."
                  action={
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => navigate("/build")}
                    >
                      <Shirt size={13} />
                      Add first item
                    </button>
                  }
                />
              ) : searchedItems.length === 0 ? (
                <EmptyState
                  icon={Shirt}
                  title="No items found"
                  description={`No items match "${searchQuery}" in this category.`}
                />
              ) : (
                <div className="item-grid">
                  {searchedItems.map((item) => (
                    <WardrobeCard
                      key={item.id}
                      item={item}
                      onEdit={(it) => setEditingItem(it)}
                      onDelete={(it) => handleDeleteItem(it)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── TAB 2: OUTFIT BUILDER (SPACIOUS 2-COLUMN LAYOUT) ── */}
          {activeTab === "outfits" && (
            <div className="outfit-builder-grid">
              {/* Column 1: Wardrobe Item Selection Browser */}
              <div className="builder-col-wardrobe">
                <div className="section-header" style={{ marginBottom: 12 }}>
                  <div>
                    <span className="section-title">Select Items</span>
                    <p style={{ fontSize: 13, color: "var(--brown-muted)", marginTop: 2 }}>
                      Click an item to toggle it in your current look
                    </p>
                  </div>
                </div>

                {/* Category filter */}
                <div className="filter-chips" style={{ marginBottom: 18 }}>
                  {CATEGORY_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      className={`filter-chip${activeFilter === f.value ? " active" : ""}`}
                      onClick={() => setActiveFilter(f.value)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {items.length === 0 ? (
                  <EmptyState
                    icon={Shirt}
                    title="No wardrobe items yet"
                    description="Add items to your closet before building outfits."
                    action={
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => navigate("/build")}
                      >
                        <Shirt size={13} />
                        Add items
                      </button>
                    }
                  />
                ) : (
                  <div className="item-grid item-grid-compact">
                    {filteredItems.map((item) => {
                      const slotCat = getNormalizedCategory(item);
                      const isSelected = outfitSlots[slotCat]?.id === item.id;
                      return (
                        <WardrobeCard
                          key={item.id}
                          item={item}
                          selectable
                          selected={isSelected}
                          onSelect={() => handleToggleItemSelection(item)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Column 2: Current Outfit Canvas & Controls */}
              <div className="builder-col-canvas">
                <div className="panel" style={{ padding: 22 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                    <div>
                      <div className="eyebrow" style={{ marginBottom: 4 }}>
                        Current Look
                      </div>
                      <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--espresso)", margin: 0 }}>
                        Outfit Canvas
                      </h2>
                    </div>
                    {outfitHasItems && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 12, color: "var(--brown-muted)" }}
                        onClick={handleClearOutfit}
                        title="Clear current outfit"
                      >
                        <RotateCcw size={12} />
                        Clear
                      </button>
                    )}
                  </div>

                  {/* Feedback Banner */}
                  {feedbackMsg && (
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "var(--r-md)",
                        marginBottom: 14,
                        fontSize: 13,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        background:
                          feedbackMsg.type === "success"
                            ? "rgba(46, 125, 50, 0.1)"
                            : "rgba(211, 47, 47, 0.1)",
                        color:
                          feedbackMsg.type === "success" ? "#2e7d32" : "#c62828",
                        border: `1px solid ${
                          feedbackMsg.type === "success"
                            ? "rgba(46, 125, 50, 0.25)"
                            : "rgba(211, 47, 47, 0.25)"
                        }`,
                      }}
                    >
                      {feedbackMsg.type === "success" ? (
                        <Check size={14} style={{ flexShrink: 0 }} />
                      ) : (
                        <AlertCircle size={14} style={{ flexShrink: 0 }} />
                      )}
                      <span>{feedbackMsg.text}</span>
                    </div>
                  )}

                  {/* Outfit Name Input */}
                  <div style={{ marginBottom: 14 }}>
                    <label
                      htmlFor="outfit-name-input"
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        color: "var(--brown-muted)",
                        marginBottom: 6,
                      }}
                    >
                      Outfit Name
                    </label>
                    <input
                      id="outfit-name-input"
                      className="form-input"
                      style={{ width: "100%" }}
                      placeholder="e.g. Beach Outfit 1, College Outfit 1..."
                      value={outfitName}
                      onChange={(e) => setOutfitName(e.target.value)}
                      aria-label="Outfit name"
                    />

                    {/* Quick Suggestions */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                      {QUICK_SUGGESTIONS.map((sug) => (
                        <button
                          key={sug}
                          type="button"
                          onClick={() => setOutfitName(sug)}
                          style={{
                            fontSize: 11,
                            padding: "3px 8px",
                            borderRadius: "var(--r-full)",
                            border: "1px solid var(--border-light)",
                            background: outfitName === sug ? "var(--terracotta)" : "var(--cream-mid)",
                            color: outfitName === sug ? "var(--white)" : "var(--espresso-mid)",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {sug}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Occasion Dropdown */}
                  <div style={{ marginBottom: 18 }}>
                    <label
                      htmlFor="outfit-occasion-select"
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        color: "var(--brown-muted)",
                        marginBottom: 6,
                      }}
                    >
                      Occasion Tag
                    </label>
                    <select
                      id="outfit-occasion-select"
                      className="form-input"
                      style={{ width: "100%", textTransform: "capitalize" }}
                      value={selectedOccasion}
                      onChange={(e) => {
                        const val = e.target.value as GarmentOccasion | "";
                        setSelectedOccasion(val);
                        if (!outfitName && val) {
                          setOutfitName(`${val.charAt(0).toUpperCase() + val.slice(1)} Outfit 1`);
                        }
                      }}
                    >
                      <option value="">Select occasion...</option>
                      {OCCASIONS.map((occ) => (
                        <option key={occ.value} value={occ.value}>
                          {occ.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Category Slots */}
                  <div className="outfit-slots">
                    {OUTFIT_SLOTS.map((slot) => (
                      <OutfitSlot
                        key={slot.category}
                        category={slot.category}
                        label={slot.label}
                        filledItem={outfitSlots[slot.category]}
                        onAdd={() => {
                          setActiveFilter(slot.category);
                        }}
                        onRemove={() => handleRemoveSlot(slot.category)}
                      />
                    ))}
                  </div>

                  <div className="divider" style={{ margin: "18px 0" }} />

                  {/* Save and styling actions */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <button
                      className="btn btn-primary"
                      style={{ width: "100%", justifyContent: "center" }}
                      disabled={!outfitHasItems || saveState === "saving"}
                      onClick={handleSaveOutfit}
                      id="save-outfit-btn"
                    >
                      {saveState === "saving" ? (
                        <>
                          <Loader2 size={14} className="spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save size={14} />
                          Save Outfit
                        </>
                      )}
                    </button>

                    <button
                      className="btn btn-secondary"
                      style={{ width: "100%", justifyContent: "center" }}
                      onClick={() => navigate("/stylist")}
                    >
                      <Wand2 size={14} />
                      Get AI Styling
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 3: SAVED OUTFITS GALLERY ── */}
          {activeTab === "saved_outfits" && (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--espresso)", margin: 0 }}>
                    Saved Outfits Collection
                  </h2>
                  <p style={{ fontSize: 13, color: "var(--brown-muted)", marginTop: 4 }}>
                    Click any outfit card to view complete item details, high-res previews, or wear it again.
                  </p>
                </div>

                {/* Occasion Filter for Saved Outfits */}
                {savedOutfits.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      className={`filter-chip${savedOccasionFilter === "all" ? " active" : ""}`}
                      style={{ padding: "4px 12px", fontSize: 12 }}
                      onClick={() => setSavedOccasionFilter("all")}
                    >
                      All
                    </button>
                    {Array.from(
                      new Set(savedOutfits.map((o) => o.occasion).filter(Boolean))
                    ).map((occ) => (
                      <button
                        key={occ}
                        className={`filter-chip${savedOccasionFilter === occ ? " active" : ""}`}
                        style={{ padding: "4px 12px", fontSize: 12, textTransform: "capitalize" }}
                        onClick={() => setSavedOccasionFilter(occ!)}
                      >
                        {occ}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Saved Outfits List */}
              {loadingSavedOutfits ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "var(--brown-muted)" }}>
                  <Loader2 size={24} className="spin" style={{ display: "inline-block", marginBottom: 12 }} />
                  <p style={{ fontSize: 14 }}>Loading saved outfits...</p>
                </div>
              ) : filteredSavedOutfits.length === 0 ? (
                <EmptyState
                  icon={Heart}
                  title="No saved outfits yet"
                  description={
                    savedOccasionFilter === "all"
                      ? "Create and save custom outfits using the Outfit Builder tab to curate your collection."
                      : `No saved outfits found for occasion "${savedOccasionFilter}".`
                  }
                  action={
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => setActiveTab("outfits")}
                    >
                      <Shirt size={13} />
                      Go to Outfit Builder
                    </button>
                  }
                />
              ) : (
                <div className="saved-outfits-grid">
                  {filteredSavedOutfits.map((outfit) => {
                    const validItems = Array.isArray(outfit.items)
                      ? outfit.items.filter((it) => Boolean(it))
                      : [];

                    return (
                      <div
                        key={outfit.id}
                        className="saved-outfit-card"
                        onClick={() => setSelectedSavedOutfit(outfit)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedSavedOutfit(outfit);
                          }
                        }}
                      >
                        <div className="saved-outfit-header">
                          <div>
                            <div className="saved-outfit-title">{outfit.name}</div>
                            <div style={{ fontSize: 12, color: "var(--brown-muted)", marginTop: 2 }}>
                              {validItems.length} {validItems.length === 1 ? "item" : "items"}
                            </div>
                          </div>
                          {outfit.occasion && (
                            <span className="saved-outfit-badge">{outfit.occasion}</span>
                          )}
                        </div>

                        {/* Item Thumbnail Strip */}
                        {validItems.length > 0 && (
                          <div className="saved-outfit-thumbs" style={{ margin: "12px 0 14px" }}>
                            {validItems.map((it, idx) =>
                              it.image_url ? (
                                <img
                                  key={it.id || idx}
                                  src={it.image_url}
                                  alt={it.name}
                                  title={it.name}
                                  className="saved-outfit-thumb"
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                  }}
                                />
                              ) : (
                                <div
                                  key={it.id || idx}
                                  title={it.name}
                                  className="saved-outfit-thumb-placeholder"
                                >
                                  {getNormalizedCategory(it).slice(0, 3)}
                                </div>
                              )
                            )}
                          </div>
                        )}

                        {/* Card Actions */}
                        <div
                          className="saved-outfit-actions"
                          style={{ marginTop: 10, display: "flex", gap: 8 }}
                        >
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ flex: 1, justifyContent: "center", fontSize: 12 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLoadOutfit(outfit);
                            }}
                          >
                            <Sparkles size={12} />
                            Wear / Load
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ color: "var(--brown-muted)", padding: "6px 8px" }}
                            title="Delete saved outfit"
                            onClick={(e) => handleDeleteOutfit(outfit.id, e)}
                            aria-label="Delete outfit"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── SAVED OUTFIT DETAIL MODAL ── */}
          {selectedSavedOutfit && (
            <SavedOutfitModal
              outfit={selectedSavedOutfit}
              isOpen={Boolean(selectedSavedOutfit)}
              onClose={() => setSelectedSavedOutfit(null)}
              onLoad={(o) => {
                handleLoadOutfit(o);
                setSelectedSavedOutfit(null);
              }}
              onDelete={(id) => {
                handleDeleteOutfit(id);
                setSelectedSavedOutfit(null);
              }}
            />
          )}

          {/* ── EDIT WARDROBE ITEM MODAL ── */}
          {editingItem && (
            <EditItemModal
              item={editingItem}
              isOpen={true}
              onClose={() => setEditingItem(null)}
              onUpdated={(updated) => {
                setItems((prev) =>
                  prev.map((it) => (it.id === updated.id ? updated : it))
                );
                setEditingItem(null);
              }}
              onDeleted={(id) => {
                setItems((prev) => prev.filter((it) => it.id !== id));
                setOutfitSlots((prev) => {
                  const next = { ...prev };
                  for (const [key, val] of Object.entries(next)) {
                    if (val?.id === id) {
                      delete next[key as GarmentCategory];
                    }
                  }
                  return next;
                });
                setSavedOutfits((prev) =>
                  prev.map((o) => ({
                    ...o,
                    items: o.items.filter((it) => it.id !== id),
                    item_ids: o.item_ids.filter((itemId) => itemId !== id),
                  }))
                );
                setEditingItem(null);
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}
