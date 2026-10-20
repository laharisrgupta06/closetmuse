import { useState, useEffect, useCallback } from "react";
import {
  Wand2,
  RefreshCw,
  Save,
  Shirt,
  AlertCircle,
  Sparkles,
  Check,
  BookmarkCheck,
  Trash2,
  Calendar,
  Loader2,
} from "lucide-react";
import Navbar from "../components/Navbar";
import EmptyState from "../components/EmptyState";
import WardrobeCard from "../components/WardrobeCard";
import type { GarmentOccasion, GarmentStyle, WardrobeItem } from "../types";
import {
  fetchWardrobeItems,
  requestStylistRecommendation,
  type StylingResultData,
} from "../services/stylistService";
import {
  saveOutfit,
  fetchSavedOutfits,
  deleteSavedOutfit,
  type SavedOutfit,
} from "../services/outfitService";
import { getNormalizedCategory } from "../utils/category";
import "../App.css";

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


type WardrobeSource = "my_closet" | "room";

// ── Slot label mapping ────────────────────────────────────────────────────────
const SLOT_LABELS: Record<string, string> = {
  tops: "Top",
  bottoms: "Bottom",
  dresses: "Dress / One-Piece",
  outerwear: "Outerwear",
  footwear: "Footwear",
  accessories: "Accessories",
  bags: "Bag",
  jewellery: "Jewellery",
  other: "Other",
};

const SLOT_ORDER = [
  "dresses",
  "tops",
  "bottoms",
  "outerwear",
  "footwear",
  "bags",
  "jewellery",
  "accessories",
  "other",
];

// ── OutfitSlots component ─────────────────────────────────────────────────────

function OutfitSlots({ items }: { items: WardrobeItem[] }) {
  // Group items by category
  const grouped = new Map<string, WardrobeItem[]>();
  for (const item of items) {
    const cat = getNormalizedCategory(item);
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }

  // Sort categories by SLOT_ORDER
  const orderedCategories = SLOT_ORDER.filter((c) => grouped.has(c));
  // Any categories not in SLOT_ORDER go at the end
  for (const cat of grouped.keys()) {
    if (!SLOT_ORDER.includes(cat)) orderedCategories.push(cat);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {orderedCategories.map((cat) => {
        const catItems = grouped.get(cat)!;
        const label = SLOT_LABELS[cat] || cat;
        return (
          <div key={cat}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--brown-muted)",
                marginBottom: 10,
                paddingBottom: 6,
                borderBottom: "1px solid var(--border-light)",
              }}
            >
              {label}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
                gap: 14,
              }}
            >
              {catItems.map((item) => (
                <WardrobeCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}


export default function Stylist() {
  const [activeTab, setActiveTab] = useState<"stylist" | "saved">("stylist");

  const [prompt, setPrompt] = useState("");
  const [occasion, setOccasion] = useState<GarmentOccasion | "">("");
  const [style, setStyle] = useState<GarmentStyle | "">("");
  const [wardrobeSource, setWardrobeSource] =
    useState<WardrobeSource>("my_closet");
  const [requesting, setRequesting] = useState(false);
  const [stylingResult, setStylingResult] = useState<StylingResultData | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWardrobeEmpty, setIsWardrobeEmpty] = useState(false);
  const [activeLookIndex, setActiveLookIndex] = useState(0);

  // Saved outfits state
  const [savedOutfits, setSavedOutfits] = useState<SavedOutfit[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [savingLook, setSavingLook] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const loadSavedOutfits = useCallback(async () => {
    setLoadingSaved(true);
    try {
      const list = await fetchSavedOutfits();
      setSavedOutfits(list);
    } catch (err) {
      console.error("Failed to load saved outfits:", err);
    } finally {
      setLoadingSaved(false);
    }
  }, []);

  useEffect(() => {
    loadSavedOutfits();
  }, [loadSavedOutfits]);

  const canRequest = prompt.trim().length > 0 || occasion !== "";

  const handleRequest = async () => {
    if (!canRequest || requesting) return;
    setRequesting(true);
    setErrorMessage(null);
    setIsWardrobeEmpty(false);

    try {
      // 1. Fetch user's real wardrobe data from Supabase
      const items = await fetchWardrobeItems();

      if (items.length === 0) {
        setIsWardrobeEmpty(true);
        setStylingResult(null);
        setRequesting(false);
        return;
      }

      // 2. Call Edge Function / fallback with items and prompt
      const result = await requestStylistRecommendation(
        {
          prompt,
          occasion,
          stylePreference: style,
          wardrobeSource,
        },
        items
      );

      setStylingResult(result);
      setActiveLookIndex(0);
      setSavedSuccess(false);
    } catch (err) {
      console.error("Styling request error:", err);
      const msg =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while contacting the AI Stylist.";
      setErrorMessage(msg);
      setStylingResult(null);
    } finally {
      setRequesting(false);
    }
  };

  const handleCycleAlternative = () => {
    if (
      !stylingResult ||
      !stylingResult.alternativeLooks ||
      stylingResult.alternativeLooks.length === 0
    ) {
      return;
    }
    const totalLooks = 1 + stylingResult.alternativeLooks.length;
    setActiveLookIndex((prev) => (prev + 1) % totalLooks);
    setSavedSuccess(false);
  };

  // Determine which items to display (main outfit vs alternative look)
  const currentItems =
    stylingResult && activeLookIndex > 0
      ? stylingResult.alternativeLooks[activeLookIndex - 1] ||
        stylingResult.outfitItems
      : stylingResult?.outfitItems || [];

  const handleSaveLook = async () => {
    if (currentItems.length === 0 || savingLook) return;
    setSavingLook(true);
    try {
      const lookName =
        [style, occasion, "Look"].filter(Boolean).join(" ") || "Curated Look";

      const saved = await saveOutfit({
        name: lookName,
        occasion,
        style,
        styling_notes: stylingResult?.stylingNotes,
        items: currentItems,
      });

      setSavedOutfits((prev) => [saved, ...prev.filter((o) => o.id !== saved.id)]);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      console.error("Failed to save outfit:", err);
      alert(err instanceof Error ? err.message : "Failed to save outfit.");
    } finally {
      setSavingLook(false);
    }
  };

  const handleDeleteOutfit = async (id: string) => {
    setSavedOutfits((prev) => prev.filter((o) => o.id !== id));
    try {
      await deleteSavedOutfit(id);
    } catch (err) {
      console.error("Failed to delete outfit:", err);
    }
  };

  return (
    <div className="app-shell">
      <Navbar />

      <main className="page-content">
        <div className="page">
          {/* Header with Tab switcher */}
          <div className="page-header">
            <div className="page-header-left">
              <div className="eyebrow">AI Styling</div>
              <h1 className="page-title">AI Stylist</h1>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className={`btn btn-sm ${
                  activeTab === "stylist" ? "btn-primary" : "btn-secondary"
                }`}
                onClick={() => setActiveTab("stylist")}
              >
                <Wand2 size={13} />
                Generate Outfit
              </button>
              <button
                type="button"
                className={`btn btn-sm ${
                  activeTab === "saved" ? "btn-primary" : "btn-secondary"
                }`}
                onClick={() => {
                  setActiveTab("saved");
                  loadSavedOutfits();
                }}
              >
                <BookmarkCheck size={13} />
                Saved Outfits {savedOutfits.length > 0 && `(${savedOutfits.length})`}
              </button>
            </div>
          </div>

          {activeTab === "saved" ? (
            /* ══════════════════════════════════════════════════════════════ */
            /*  SAVED OUTFITS VIEW                                            */
            /* ══════════════════════════════════════════════════════════════ */
            <div>
              {loadingSaved ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 48,
                    gap: 12,
                    color: "var(--brown-muted)",
                  }}
                >
                  <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                  Loading your saved outfits…
                </div>
              ) : savedOutfits.length === 0 ? (
                <EmptyState
                  icon={BookmarkCheck}
                  title="No saved outfits yet"
                  description="When you generate a look you love with the AI Stylist, click 'Save Look' to save it here for quick inspiration."
                  action={
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      style={{ marginTop: 12 }}
                      onClick={() => setActiveTab("stylist")}
                    >
                      Create an Outfit
                    </button>
                  }
                />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  {savedOutfits.map((outfit) => {
                    const formattedDate = outfit.created_at
                      ? new Date(outfit.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : null;

                    return (
                      <div key={outfit.id} className="panel" style={{ padding: 24 }}>
                        {/* Outfit card header */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            marginBottom: 16,
                            gap: 16,
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontFamily: "var(--font-serif)",
                                fontSize: 18,
                                fontWeight: 500,
                                color: "var(--espresso)",
                                marginBottom: 6,
                              }}
                            >
                              {outfit.name}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              {outfit.occasion && (
                                <span className="tag" style={{ textTransform: "capitalize" }}>
                                  {outfit.occasion}
                                </span>
                              )}
                              {outfit.style && (
                                <span className="tag" style={{ textTransform: "capitalize" }}>
                                  {outfit.style}
                                </span>
                              )}
                              {formattedDate && (
                                <span
                                  style={{
                                    fontSize: 12,
                                    color: "var(--brown-muted)",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                  }}
                                >
                                  <Calendar size={12} />
                                  {formattedDate}
                                </span>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            className="icon-btn"
                            style={{ color: "var(--brown-muted)" }}
                            onClick={() => handleDeleteOutfit(outfit.id)}
                            aria-label="Delete saved outfit"
                            title="Delete outfit"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                        {/* Styling notes */}
                        {outfit.styling_notes && (
                          <div
                            style={{
                              padding: "10px 14px",
                              background: "var(--cream-mid)",
                              borderRadius: "var(--radius-md)",
                              marginBottom: 16,
                              fontSize: 13,
                              lineHeight: 1.5,
                              color: "var(--espresso)",
                            }}
                          >
                            <span style={{ fontWeight: 600, marginRight: 6 }}>
                              Stylist Note:
                            </span>
                            {outfit.styling_notes}
                          </div>
                        )}

                        {/* Pieces grid */}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fill, minmax(160px, 1fr))",
                            gap: 14,
                          }}
                        >
                          {outfit.items && outfit.items.length > 0 ? (
                            outfit.items.map((item) => (
                              <WardrobeCard key={item.id} item={item} />
                            ))
                          ) : (
                            <div style={{ fontSize: 13, color: "var(--brown-muted)" }}>
                              Items in this outfit are no longer in wardrobe.
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* ══════════════════════════════════════════════════════════════ */
            /*  AI STYLIST GENERATOR VIEW                                     */
            /* ══════════════════════════════════════════════════════════════ */
            <div className="stylist-layout">
              {/* Left: Controls */}
              <div className="stylist-panel">
                {/* Natural Language Prompt Input */}
                <div style={{ marginBottom: 24 }}>
                  <div
                    className="eyebrow"
                    style={{
                      marginBottom: 8,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Sparkles size={13} color="var(--rose)" />
                    Styling Request
                  </div>
                  <textarea
                    className="form-textarea"
                    style={{
                      width: "100%",
                      minHeight: 88,
                      resize: "vertical",
                      boxSizing: "border-box",
                    }}
                    placeholder="Build me a casual outfit for college using my wardrobe. Prefer black..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                  />
                </div>

                <div className="divider" />

                {/* Occasion */}
                <div style={{ marginBottom: 24 }}>
                  <div className="eyebrow" style={{ marginBottom: 12 }}>
                    Occasion
                  </div>
                  <div className="select-grid">
                    {OCCASIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        className={`select-option${occasion === o.value ? " selected" : ""}`}
                        onClick={() =>
                          setOccasion((prev) =>
                            prev === o.value ? "" : o.value
                          )
                        }
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="divider" />

                {/* Style Preference */}
                <div style={{ marginBottom: 24 }}>
                  <div className="eyebrow" style={{ marginBottom: 12 }}>
                    Style Preference
                  </div>
                  <div className="select-grid">
                    {STYLES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        className={`select-option${style === s.value ? " selected" : ""}`}
                        onClick={() =>
                          setStyle((prev) => (prev === s.value ? "" : s.value))
                        }
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="divider" />

                {/* Wardrobe Source */}
                <div style={{ marginBottom: 24 }}>
                  <div className="eyebrow" style={{ marginBottom: 12 }}>
                    Style From
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <button
                      type="button"
                      className={`select-option${wardrobeSource === "my_closet" ? " selected" : ""}`}
                      style={{
                        height: "auto",
                        padding: "12px 16px",
                        textAlign: "left",
                        justifyContent: "flex-start",
                      }}
                      onClick={() => setWardrobeSource("my_closet")}
                    >
                      <Shirt size={15} style={{ flexShrink: 0 }} />
                      My Closet
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: "100%" }}
                  disabled={!canRequest || requesting}
                  onClick={handleRequest}
                  id="style-me-btn"
                >
                  {requesting ? (
                    <>
                      <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
                      Styling you…
                    </>
                  ) : (
                    <>
                      <Wand2 size={15} />
                      Style Me
                    </>
                  )}
                </button>
              </div>

              {/* Right: Result */}
              <div>
                {requesting ? (
                  <div className="stylist-result-area">
                    <div
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: "50%",
                        background: "var(--cream-mid)",
                        display: "grid",
                        placeItems: "center",
                        color: "var(--brown-muted)",
                      }}
                    >
                      <Wand2 size={22} />
                    </div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: "var(--espresso)",
                      }}
                    >
                      Consulting your AI Stylist...
                    </div>
                    <p
                      style={{
                        fontSize: 13,
                        color: "var(--brown-soft)",
                        maxWidth: 280,
                        textAlign: "center",
                      }}
                    >
                      Analyzing your real wardrobe pieces and assembling a look.
                    </p>
                  </div>
                ) : errorMessage ? (
                  <div className="panel" style={{ padding: 28 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        color: "var(--rose)",
                      }}
                    >
                      <AlertCircle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <div
                          style={{
                            fontSize: 15,
                            fontWeight: 600,
                            color: "var(--espresso)",
                            marginBottom: 4,
                          }}
                        >
                          Stylist Service Error
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--brown-mid)",
                            lineHeight: 1.5,
                          }}
                        >
                          {errorMessage}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : isWardrobeEmpty ? (
                  <EmptyState
                    icon={Shirt}
                    title="Your wardrobe is empty"
                    description="You don't have any items saved in your wardrobe yet. Add garments through 'Build' or 'My Closet' so the AI Stylist has pieces to select from."
                  />
                ) : stylingResult ? (
                  <div className="panel" style={{ padding: 28 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 20,
                        flexWrap: "wrap",
                        gap: 12,
                      }}
                    >
                      <div>
                        <div className="eyebrow">
                          {activeLookIndex === 0
                            ? "AI Recommendation"
                            : `Alternative Look #${activeLookIndex}`}
                        </div>
                        <div
                          style={{
                            fontFamily: "var(--font-serif)",
                            fontSize: 20,
                            fontWeight: 500,
                            marginTop: 4,
                          }}
                        >
                          Your Styled Look
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {stylingResult.alternativeLooks &&
                          stylingResult.alternativeLooks.length > 0 && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={handleCycleAlternative}
                            >
                              <RefreshCw size={13} />
                              Alternative
                            </button>
                          )}
                        <button
                          type="button"
                          className={`btn ${savedSuccess ? "btn-secondary" : "btn-primary"} btn-sm`}
                          disabled={savingLook || currentItems.length === 0}
                          onClick={handleSaveLook}
                          id="save-look-btn"
                        >
                          {savingLook ? (
                            <>
                              <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                              Saving…
                            </>
                          ) : savedSuccess ? (
                            <>
                              <Check size={13} />
                              Saved!
                            </>
                          ) : (
                            <>
                              <Save size={13} />
                              Save Look
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* AI Styling Notes */}
                    {stylingResult.stylingNotes && (
                      <div
                        style={{
                          padding: "14px 16px",
                          background: "var(--cream-mid)",
                          borderRadius: "var(--radius-md)",
                          marginBottom: 20,
                          fontSize: 13,
                          lineHeight: 1.6,
                          color: "var(--espresso)",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 600,
                            marginBottom: 4,
                            fontSize: 12,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            color: "var(--brown-muted)",
                          }}
                        >
                          Stylist Notes
                        </div>
                        {stylingResult.stylingNotes}
                      </div>
                    )}

                    {/* Outfit Items — grouped by slot with correct labels */}
                    {currentItems.length > 0 ? (
                      <div>
                        <div
                          className="eyebrow"
                          style={{ marginBottom: 14, color: "var(--brown-muted)" }}
                        >
                          Pieces in this look ({currentItems.length})
                        </div>
                        <OutfitSlots items={currentItems} />
                      </div>
                    ) : (
                      <EmptyState
                        icon={Shirt}
                        title="No matching pieces found"
                        description="The stylist could not assemble a complete look with your current items. Try expanding your request or adding more pieces to your closet."
                      />
                    )}
                  </div>
                ) : (
                  <EmptyState
                    icon={Wand2}
                    title="Your styled outfit will appear here"
                    description="Type a styling request or select an occasion to get a personalised outfit recommendation from your wardrobe."
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
