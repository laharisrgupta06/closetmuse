/**
 * Build.tsx
 * Wardrobe ingestion page — single-item and batch modes.
 *
 * SINGLE: Upload/capture → AI analysis → user edits form → save → closet
 * BATCH:  Pick multiple files → parallel AI analysis → review/reject each → save approved
 */
import { useState, useRef } from "react";
import type { DragEvent, ChangeEvent } from "react";
import {
  Upload,
  Image,
  X,
  Check,
  ChevronDown,
  Sparkles,
  Loader2,
  Camera,
  AlertCircle,
  Edit3,
  Layers,
  CheckCircle2,
  XCircle,
  Package,
  Eye,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import type { GarmentCategory, GarmentOccasion, GarmentStyle } from "../types";
import { analyseGarmentImage, encodeImageForAnalysis } from "../services/geminiService";
import type { GarmentAnalysis } from "../services/geminiService";
import { uploadGarmentImage, createWardrobeItem } from "../services/wardrobeService";
import { isolateGarment } from "../services/imageIsolationService";
import { getNormalizedCategory } from "../utils/category";
import "../App.css";

/* ─── Constants ──────────────────────────────────────────────── */
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

const COLORS = [
  { label: "Black", hex: "#1a1a1a" },
  { label: "White", hex: "#f5f5f0" },
  { label: "Ivory", hex: "#f8f3e6" },
  { label: "Beige", hex: "#d4b896" },
  { label: "Camel", hex: "#c19a6b" },
  { label: "Brown", hex: "#7b5b3a" },
  { label: "Navy", hex: "#1f3054" },
  { label: "Blue", hex: "#3b6ea5" },
  { label: "Grey", hex: "#808080" },
  { label: "Green", hex: "#4a7c59" },
  { label: "Olive", hex: "#6b7738" },
  { label: "Red", hex: "#c0392b" },
  { label: "Pink", hex: "#d4849c" },
  { label: "Burgundy", hex: "#6d1f2e" },
  { label: "Orange", hex: "#d4652a" },
  { label: "Yellow", hex: "#d4b030" },
  { label: "Purple", hex: "#6b4c8a" },
  { label: "Multi", hex: "linear-gradient(135deg, #e74c3c, #3498db, #2ecc71)" },
];

const STYLE_BRANCHES = ["Traditional", "Indo-Western", "Western", "Unknown"];

interface GarmentForm {
  name: string;
  category: GarmentCategory | "";
  style_branch: string;
  subcategory: string;
  color: string;
  material: string;
  pattern: string;
  occasion: GarmentOccasion | "";
  style: GarmentStyle | "";
  brand: string;
  notes: string;
  is_shared: boolean;
}

const EMPTY_FORM: GarmentForm = {
  name: "",
  category: "",
  style_branch: "",
  subcategory: "",
  color: "",
  material: "",
  pattern: "",
  occasion: "",
  style: "",
  brand: "",
  notes: "",
  is_shared: false,
};

type AnalysisState = "idle" | "analysing" | "done" | "error";
type SaveState = "idle" | "saving" | "saved" | "error";
type PageMode = "single" | "batch";

/* ─── Batch item types ───────────────────────────────────────── */
interface BatchItem {
  id: string;
  file: File;
  isolatedFile?: File;
  previewUrl: string;
  rawPreviewUrl: string;
  status: "pending" | "analysing" | "done" | "error";
  isolationStatus: "pending" | "isolating" | "done" | "error";
  isolationQuality?: "clean" | "uncertain";
  /** Why an uncertain cut-out was flagged */
  isolationIssue?: string;
  isolationError?: string | null;
  /** Save the background-removed PNG (true) or the original photo (false) */
  useIsolated: boolean;
  analysis: GarmentAnalysis | null;
  form: GarmentForm;
  error: string | null;
  /** true = will be saved; false = rejected by user */
  approved: boolean;
  /** Already added to the closet (prevents duplicates when retrying a save) */
  saved?: boolean;
}

const MAX_BATCH_ITEMS = 20;

function isImageFile(f: File): boolean {
  return f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name);
}

/* ─── Helpers ─────────────────────────────────────────────────── */
function mapAnalysisToForm(a: GarmentAnalysis): Partial<GarmentForm> {
  const category = getNormalizedCategory({
    category: a.major_category,
    subcategory: a.subcategory,
    name: a.suggested_name,
  });

  // Build a sensible default name when Gemini doesn't return suggested_name
  const fallbackName = [a.color, a.subcategory || a.major_category]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    name: a.suggested_name || fallbackName || "Unnamed Item",
    category,
    style_branch: a.style_branch || "",
    subcategory: a.subcategory || "",
    color: a.color || "",
    material: a.material || "",
    pattern: a.pattern || "",
    occasion: (a.occasion as GarmentOccasion) || "",
    style: (a.style as GarmentStyle) || "",
  };
}

/* ══════════════════════════════════════════════════════════════ */
/*  SINGLE-ITEM SUB-COMPONENT                                    */
/* ══════════════════════════════════════════════════════════════ */
function SingleItemMode() {
  const navigate = useNavigate();
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rawPreviewUrl, setRawPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isolatedFile, setIsolatedFile] = useState<File | null>(null);
  const [isolationState, setIsolationState] = useState<"idle" | "isolating" | "done" | "error">("idle");
  const [isolationQuality, setIsolationQuality] = useState<"clean" | "uncertain" | null>(null);
  const [isolationIssue, setIsolationIssue] = useState<string | null>(null);
  const [isolationError, setIsolationError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"isolated" | "original">("isolated");
  const [form, setForm] = useState<GarmentForm>(EMPTY_FORM);
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<GarmentAnalysis | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File) => {
    if (!isImageFile(f)) {
      setUploadError(`"${f.name}" is not an image. Choose a JPG, PNG, WebP or HEIC photo.`);
      return;
    }
    setUploadError(null);
    setFile(f);
    const url = URL.createObjectURL(f);
    setRawPreviewUrl(url);
    setPreviewUrl(url);
    setIsolatedFile(null);
    setIsolationState("idle");
    setIsolationQuality(null);
    setIsolationIssue(null);
    setIsolationError(null);
    setViewMode("isolated");
    setForm(EMPTY_FORM);
    setAnalysis(null);
    setAnalysisState("idle");
    setAnalysisError(null);
    setSaveState("idle");
    setSaveError(null);
    // Analysis first (≈2s) so its bounding box can guide background removal;
    // background removal runs either way, even if analysis fails.
    const result = await runAnalysis(f);
    await runIsolation(f, result?.box_2d);
  };

  const runAnalysis = async (f: File): Promise<GarmentAnalysis | null> => {
    setAnalysisState("analysing");
    setAnalysisError(null);
    try {
      const { base64, mimeType } = await encodeImageForAnalysis(f);
      const result = await analyseGarmentImage(base64, mimeType);
      setAnalysis(result);
      setForm((prev) => ({ ...prev, ...mapAnalysisToForm(result) }));
      setAnalysisState("done");
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Analysis failed.";
      setAnalysisError(msg);
      setAnalysisState("error");
      return null;
    }
  };

  const runIsolation = async (f: File, box2d?: [number, number, number, number]) => {
    setIsolationState("isolating");
    setIsolationError(null);
    try {
      const iso = await isolateGarment(f, box2d);
      setIsolatedFile(iso.file);
      setPreviewUrl(iso.previewUrl);
      setIsolationQuality(iso.quality);
      setIsolationIssue(iso.issue ?? null);
      // Show (and therefore save) the cut-out only when it is clean
      setViewMode(iso.quality === "clean" ? "isolated" : "original");
      setIsolationState("done");
    } catch (isoErr) {
      console.warn("Background removal error:", isoErr);
      setIsolationError(isoErr instanceof Error ? isoErr.message : "Background removal failed.");
      setIsolationState("error");
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleSave = async () => {
    if (!isFormValid || saveState === "saving") return;
    setSaveState("saving");
    setSaveError(null);
    try {
      let imageUrl: string | undefined;
      // Save the version the user is looking at
      const fileToUpload = viewMode === "isolated" && isolatedFile ? isolatedFile : file;
      if (fileToUpload) imageUrl = await uploadGarmentImage(fileToUpload);
      await createWardrobeItem(
        {
          name: form.name,
          category: form.category as GarmentCategory,
          style_branch: form.style_branch || undefined,
          subcategory: form.subcategory || undefined,
          color: form.color || undefined,
          material: form.material || undefined,
          pattern: form.pattern || undefined,
          occasion: (form.occasion as GarmentOccasion) || undefined,
          style: (form.style as GarmentStyle) || undefined,
          brand: form.brand || undefined,
          notes: form.notes || undefined,
          is_shared: form.is_shared,
        },
        imageUrl
      );
      setSaveState("saved");
      setTimeout(() => navigate("/closet"), 1600);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed.";
      setSaveError(msg);
      setSaveState("error");
    }
  };

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (rawPreviewUrl && rawPreviewUrl !== previewUrl) URL.revokeObjectURL(rawPreviewUrl);
    setPreviewUrl(null);
    setRawPreviewUrl(null);
    setFile(null);
    setIsolatedFile(null);
    setIsolationState("idle");
    setIsolationQuality(null);
    setIsolationIssue(null);
    setIsolationError(null);
    setForm(EMPTY_FORM);
    setAnalysis(null);
    setAnalysisState("idle");
    setAnalysisError(null);
    setSaveState("idle");
    setSaveError(null);
  };

  const isFormValid = form.name.trim() !== "" && form.category !== "";

  return (
    <div className="build-layout">
      {/* ── Left: Upload + Preview ── */}
      <div>
        {!previewUrl ? (
          <div
            className={`upload-zone${isDragging ? " dragging" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            aria-label="Upload garment image"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            <div className="upload-icon"><Upload size={22} /></div>
            <h3>Upload garment photo</h3>
            <p>
              Drag and drop here, or click to browse.
              <br />
              JPG, PNG, WebP supported.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button className="btn btn-secondary btn-sm" type="button">
                <Image size={13} />
                Choose file
              </button>
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click(); }}
              >
                <Camera size={13} />
                Camera
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
              aria-label="File upload input"
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
              aria-label="Camera capture input"
            />
            {uploadError && (
              <p style={{ fontSize: 12, color: "var(--rose)", marginTop: 10 }} role="alert">
                {uploadError}
              </p>
            )}
          </div>
        ) : (
          <div
            style={{
              borderRadius: "var(--r-2xl)",
              overflow: "hidden",
              border: "1px solid var(--border)",
              position: "relative",
              background: "var(--cream-mid)",
            }}
          >
            <img
              src={viewMode === "isolated" && isolatedFile ? previewUrl : rawPreviewUrl || previewUrl}
              alt="Garment preview"
              style={{ width: "100%", maxHeight: 480, objectFit: "contain", display: "block" }}
            />
            {isolatedFile && (
              <div
                style={{
                  position: "absolute",
                  bottom: 12,
                  left: 12,
                  display: "flex",
                  gap: 6,
                  background: "rgba(255,255,255,0.92)",
                  padding: "4px 8px",
                  borderRadius: "var(--r-md)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <button
                  type="button"
                  className={`filter-chip${viewMode === "isolated" ? " active" : ""}`}
                  style={{ fontSize: 11, padding: "3px 8px" }}
                  onClick={() => setViewMode("isolated")}
                >
                  ✨ Isolated
                </button>
                <button
                  type="button"
                  className={`filter-chip${viewMode === "original" ? " active" : ""}`}
                  style={{ fontSize: 11, padding: "3px 8px" }}
                  onClick={() => setViewMode("original")}
                >
                  Original
                </button>
                <span style={{ fontSize: 11, color: "var(--brown-muted)", alignSelf: "center" }}>
                  Shown version is saved
                </span>
              </div>
            )}
            <button
              className="icon-btn"
              style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,0.92)" }}
              onClick={handleReset}
              aria-label="Remove image"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* AI Analysis Status Panel */}
        {previewUrl && (
          <div
            className="card card-sm"
            style={{ marginTop: 14, background: analysisState === "done" ? "var(--gold-pale)" : "var(--cream-dark)" }}
          >
            {analysisState === "analysing" && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite", color: "var(--brown-soft)" }} />
                <span style={{ fontSize: 13, color: "var(--brown-soft)" }}>Analysing garment with AI…</span>
              </div>
            )}
            {isolationState === "isolating" && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: analysisState === "analysing" ? 6 : 0 }}>
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite", color: "var(--gold)" }} />
                <span style={{ fontSize: 12, color: "var(--brown-soft)" }}>Isolating clothing & removing background…</span>
              </div>
            )}
            {isolationState === "done" && isolationQuality === "clean" && (
              <div style={{ fontSize: 12, color: "var(--brown-soft)", marginBottom: 8 }}>
                ✨ Background removed (transparent PNG).
              </div>
            )}
            {isolationState === "done" && isolationQuality === "uncertain" && (
              <div style={{ fontSize: 12, color: "var(--brown-soft)", marginBottom: 8 }}>
                Background removal was unreliable on this photo
                {isolationIssue ? ` (${isolationIssue.replace(/\.$/, "").toLowerCase()})` : ""}, so the
                original is selected. Switch to <strong>Isolated</strong> to use the cut-out anyway.
              </div>
            )}
            {isolationState === "error" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12, color: "var(--brown-soft)", marginBottom: 8 }}>
                <span>{isolationError} The original photo will be saved.</span>
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  onClick={() => file && runIsolation(file, analysis?.box_2d)}
                >
                  Retry background removal
                </button>
              </div>
            )}
            {analysisState === "done" && analysis && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Sparkles size={15} style={{ color: "var(--gold)" }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--espresso)" }}>
                    AI Detection Complete
                  </span>
                  <span style={{ fontSize: 11, color: "var(--brown-muted)", marginLeft: "auto" }}>
                    {Math.round(analysis.confidence * 100)}% confidence
                  </span>
                </div>
                <div
                  style={{
                    background: "var(--white)",
                    borderRadius: "var(--r-md)",
                    padding: "12px 14px",
                    fontSize: 13,
                    color: "var(--espresso)",
                    lineHeight: 1.7,
                  }}
                >
                  <strong>This item will be added as:</strong>
                  <br />
                  <span style={{ color: "var(--brown-soft)" }}>
                    {analysis.style_branch} → {analysis.major_category}
                    {analysis.subcategory ? ` → ${analysis.subcategory}` : ""}
                  </span>
                  {analysis.color && (<><br />Colour: <strong>{analysis.color}</strong></>)}
                  {analysis.material && (<><br />Material: <strong>{analysis.material}</strong></>)}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                  <Edit3 size={12} style={{ color: "var(--brown-muted)" }} />
                  <span style={{ fontSize: 12, color: "var(--brown-muted)" }}>
                    Review and edit the details below before saving.
                  </span>
                </div>
              </div>
            )}
            {analysisState === "error" && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <AlertCircle size={16} style={{ color: "var(--rose)", flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--espresso)", marginBottom: 2 }}>
                    AI analysis unavailable
                  </div>
                  <div style={{ fontSize: 12, color: "var(--brown-soft)" }}>
                    {analysisError} Fill in the details manually below.
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: 8 }}
                    onClick={() => file && runAnalysis(file)}
                  >
                    Retry analysis
                  </button>
                </div>
              </div>
            )}
            {analysisState === "idle" && (
              <p style={{ fontSize: 13, color: "var(--brown-soft)" }}>
                AI garment detection is not yet connected. Fill in the details manually below.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Right: Metadata form ── */}
      <div className="panel" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Item Details</div>

          {/* Name */}
          <div className="form-group">
            <label className="form-label" htmlFor="name">
              Name <span style={{ color: "var(--rose)" }}>*</span>
            </label>
            <input
              id="name"
              name="name"
              className="form-input"
              placeholder="e.g. Red Banarasi Saree"
              value={form.name}
              onChange={handleInputChange}
            />
          </div>
        </div>

        {/* Style Branch */}
        <div className="form-group">
          <label className="form-label">Style Branch</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {STYLE_BRANCHES.map((b) => (
              <button
                key={b}
                type="button"
                className={`filter-chip${form.style_branch === b ? " active" : ""}`}
                onClick={() => setForm((prev) => ({ ...prev, style_branch: prev.style_branch === b ? "" : b }))}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* Subcategory */}
        <div className="form-group">
          <label className="form-label" htmlFor="subcategory">Type / Subcategory</label>
          <input
            id="subcategory"
            name="subcategory"
            className="form-input"
            placeholder="e.g. Saree, Kurti, Jeans, Sneakers"
            value={form.subcategory}
            onChange={handleInputChange}
          />
        </div>

        {/* Category */}
        <div className="form-group">
          <label className="form-label" htmlFor="category">
            Category <span style={{ color: "var(--rose)" }}>*</span>
          </label>
          <div style={{ position: "relative" }}>
            <select
              id="category"
              name="category"
              className="form-select"
              value={form.category}
              onChange={handleInputChange}
            >
              <option value="">Select category</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <ChevronDown
              size={14}
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--brown-muted)" }}
            />
          </div>
        </div>

        {/* Color */}
        <div className="form-group">
          <label className="form-label">Colour</label>
          <div className="color-swatches">
            {COLORS.map((c) => (
              <button
                key={c.label}
                type="button"
                className={`color-swatch${form.color === c.label ? " selected" : ""}`}
                style={{ background: c.hex }}
                title={c.label}
                onClick={() => setForm((prev) => ({ ...prev, color: prev.color === c.label ? "" : c.label }))}
                aria-label={c.label}
              />
            ))}
          </div>
          {form.color && (
            <div style={{ fontSize: 12, color: "var(--brown-soft)", marginTop: 4 }}>
              Selected: {form.color}
            </div>
          )}
        </div>

        {/* Material */}
        <div className="form-group">
          <label className="form-label" htmlFor="material">Material</label>
          <input
            id="material"
            name="material"
            className="form-input"
            placeholder="e.g. Silk, Cotton, Wool, Polyester"
            value={form.material}
            onChange={handleInputChange}
          />
        </div>

        {/* Pattern */}
        <div className="form-group">
          <label className="form-label" htmlFor="pattern">Pattern / Craft</label>
          <input
            id="pattern"
            name="pattern"
            className="form-input"
            placeholder="e.g. Solid, Floral, Embroidered, Zari"
            value={form.pattern}
            onChange={handleInputChange}
          />
        </div>

        {/* Occasion */}
        <div className="form-group">
          <label className="form-label" htmlFor="occasion">Occasion</label>
          <select id="occasion" name="occasion" className="form-select" value={form.occasion} onChange={handleInputChange}>
            <option value="">Select occasion</option>
            {OCCASIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Style */}
        <div className="form-group">
          <label className="form-label" htmlFor="style">Style</label>
          <select id="style" name="style" className="form-select" value={form.style} onChange={handleInputChange}>
            <option value="">Select style</option>
            {STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {/* Brand */}
        <div className="form-group">
          <label className="form-label" htmlFor="brand">Brand / Provenance</label>
          <input
            id="brand"
            name="brand"
            className="form-input"
            placeholder="e.g. Vintage, Zara, Handmade"
            value={form.brand}
            onChange={handleInputChange}
          />
        </div>

        {/* Notes */}
        <div className="form-group">
          <label className="form-label" htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            name="notes"
            className="form-textarea"
            placeholder="Care instructions, size, where you got it…"
            value={form.notes}
            onChange={handleInputChange}
          />
        </div>

        {/* Shared toggle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
            background: "var(--cream-dark)",
          }}
        >
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Share in Rooms</div>
            <div style={{ fontSize: 12, color: "var(--brown-soft)", marginTop: 2 }}>
              Marks this item as one you're happy to share. Nothing is shared until
              you add it to a Room from that Room's "Share items".
            </div>
          </div>
          <label style={{ position: "relative", display: "inline-block", width: 40, height: 22, cursor: "pointer", flexShrink: 0 }}>
            <input
              type="checkbox"
              name="is_shared"
              style={{ opacity: 0, width: 0, height: 0 }}
              checked={form.is_shared}
              onChange={handleInputChange}
            />
            <span
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 11,
                background: form.is_shared ? "var(--espresso)" : "var(--muted)",
                transition: "background 0.2s",
              }}
            />
            <span
              style={{
                position: "absolute",
                top: 3,
                left: form.is_shared ? 21 : 3,
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "white",
                transition: "left 0.2s",
              }}
            />
          </label>
        </div>

        {/* Save error */}
        {saveState === "error" && saveError && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "12px 14px",
              background: "var(--rose-pale)",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--rose-light)",
            }}
          >
            <AlertCircle size={15} style={{ color: "var(--rose)", flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 13, color: "var(--espresso)" }}>{saveError}</span>
          </div>
        )}

        {/* Which image will be stored */}
        {file && isolationState !== "isolating" && (
          <p id="save-image-choice" style={{ fontSize: 12, color: "var(--brown-soft)", textAlign: "center", margin: 0 }}>
            Will save:{" "}
            <strong>
              {viewMode === "isolated" && isolatedFile
                ? "background-removed image (transparent PNG)"
                : "original photo (background not removed)"}
            </strong>
          </p>
        )}

        {/* Save button */}
        <button
          className={`btn ${saveState === "saved" ? "btn-secondary" : "btn-primary"}`}
          style={{ width: "100%" }}
          onClick={handleSave}
          disabled={!isFormValid || saveState === "saving" || saveState === "saved"}
          id="save-to-closet-btn"
        >
          {saveState === "saving" ? (
            <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />Saving…</>
          ) : saveState === "saved" ? (
            <><Check size={14} />Saved! Redirecting…</>
          ) : (
            "Add to Closet"
          )}
        </button>

        {!isFormValid && (
          <p style={{ fontSize: 12, color: "var(--brown-muted)", textAlign: "center", marginTop: -8 }}>
            Name and category are required
          </p>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*  BATCH MODE SUB-COMPONENT                                      */
/* ══════════════════════════════════════════════════════════════ */
function BatchMode() {
  const navigate = useNavigate();
  const batchInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [batchSaveState, setBatchSaveState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [saveProgress, setSaveProgress] = useState<{ current: number; total: number } | null>(null);
  const [batchSaveError, setBatchSaveError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [inspectItem, setInspectItem] = useState<BatchItem | null>(null);
  const [inspectMode, setInspectMode] = useState<"isolated" | "original">("isolated");
  const [batchNotice, setBatchNotice] = useState<string | null>(null);

  const patchItem = (id: string, patch: Partial<BatchItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const runItemAnalysis = async (id: string, file: File): Promise<GarmentAnalysis | null> => {
    patchItem(id, { status: "analysing", error: null });
    try {
      const { base64, mimeType } = await encodeImageForAnalysis(file);
      const result = await analyseGarmentImage(base64, mimeType);
      patchItem(id, {
        status: "done",
        analysis: result,
        form: { ...EMPTY_FORM, ...mapAnalysisToForm(result) },
      });
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Analysis failed.";
      patchItem(id, { status: "error", error: msg });
      return null;
    }
  };

  const runItemIsolation = async (id: string, file: File, box2d?: [number, number, number, number]) => {
    patchItem(id, { isolationStatus: "isolating", isolationError: null });
    try {
      const iso = await isolateGarment(file, box2d);
      patchItem(id, {
        isolationStatus: "done",
        isolatedFile: iso.file,
        previewUrl: iso.previewUrl,
        isolationQuality: iso.quality,
        isolationIssue: iso.issue,
        useIsolated: iso.quality === "clean",
      });
    } catch (isoErr) {
      console.warn("Batch isolation error:", isoErr);
      patchItem(id, {
        isolationStatus: "error",
        isolationError: isoErr instanceof Error ? isoErr.message : "Background removal failed.",
        useIsolated: false,
      });
    }
  };

  // Background removal runs whether or not the analysis succeeds
  const analyseItem = async (id: string, file: File) => {
    const result = await runItemAnalysis(id, file);
    await runItemIsolation(id, file, result?.box_2d);
  };

  const setUseIsolated = (id: string, useIsolated: boolean) => {
    patchItem(id, { useIsolated });
    setInspectItem((prev) => (prev && prev.id === id ? { ...prev, useIsolated } : prev));
  };

  const handleBatchFiles = async (files: FileList) => {
    const images = Array.from(files).filter(isImageFile);
    const skipped = files.length - images.length;
    const room = Math.max(0, MAX_BATCH_ITEMS - items.filter((it) => !it.saved).length);
    const validFiles = images.slice(0, room);
    const notices = [];
    if (skipped > 0) notices.push(`${skipped} file${skipped !== 1 ? "s were" : " was"} skipped because ${skipped !== 1 ? "they are" : "it is"} not an image.`);
    if (images.length > room) notices.push(`Only ${MAX_BATCH_ITEMS} photos can be processed at once; ${images.length - room} were not added.`);
    setBatchNotice(notices.length ? notices.join(" ") : null);
    if (validFiles.length === 0) return;

    const newItems: BatchItem[] = validFiles.map((f) => {
      const url = URL.createObjectURL(f);
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file: f,
        previewUrl: url,
        rawPreviewUrl: url,
        status: "pending",
        isolationStatus: "pending",
        useIsolated: false,
        analysis: null,
        form: { ...EMPTY_FORM },
        error: null,
        approved: true,
      };
    });

    setItems((prev) => [...prev, ...newItems]);
    setBatchSaveState("idle");

    // Process batch items with controlled concurrency (2 at a time) to prevent Gemini 429 rate limits
    const queue = [...newItems];
    const runWorker = async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (next) await analyseItem(next.id, next.file);
      }
    };
    await Promise.all([runWorker(), runWorker()]);
  };

  const toggleApproval = (id: string) => {
    setItems((prev) =>
      prev.map((it) => it.id === id ? { ...it, approved: !it.approved } : it)
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const item = prev.find((it) => it.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((it) => it.id !== id);
    });
    if (expandedId === id) setExpandedId(null);
  };

  const updateBatchForm = (id: string, field: keyof GarmentForm, value: string | boolean) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const newForm = { ...it.form, [field]: value };
        return {
          ...it,
          form: newForm,
          status: it.status === "error" ? "done" : it.status,
          error: it.status === "error" ? null : it.error,
        };
      })
    );
  };

  // Items whose analysis failed can still be saved once filled in manually
  const approvedItems = items.filter(
    (it) => it.approved && !it.saved && (it.status === "done" || it.status === "error")
  );
  const canSave = approvedItems.length > 0 && approvedItems.every((it) => it.form.name.trim() && it.form.category);

  const handleBatchSave = async () => {
    if (!canSave || batchSaveState === "saving") return;
    setBatchSaveState("saving");
    setBatchSaveError(null);
    try {
      for (let i = 0; i < approvedItems.length; i++) {
        const item = approvedItems[i];
        setSaveProgress({ current: i + 1, total: approvedItems.length });
        const fileToUpload = item.useIsolated && item.isolatedFile ? item.isolatedFile : item.file;
        const imageUrl = await uploadGarmentImage(fileToUpload);
        await createWardrobeItem(
          {
            name: item.form.name,
            category: item.form.category as GarmentCategory,
            style_branch: item.form.style_branch || undefined,
            subcategory: item.form.subcategory || undefined,
            color: item.form.color || undefined,
            material: item.form.material || undefined,
            pattern: item.form.pattern || undefined,
            occasion: (item.form.occasion as GarmentOccasion) || undefined,
            style: (item.form.style as GarmentStyle) || undefined,
            brand: item.form.brand || undefined,
            notes: item.form.notes || undefined,
            is_shared: item.form.is_shared,
          },
          imageUrl
        );
        // Mark as saved right away so a retry after a later failure skips it
        patchItem(item.id, { saved: true });
      }
      setBatchSaveState("done");
      setTimeout(() => navigate("/closet"), 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed.";
      setBatchSaveError(msg);
      setBatchSaveState("error");
    } finally {
      setSaveProgress(null);
    }
  };

  const analysing = items.filter(
    (it) =>
      !it.saved &&
      (it.status === "analysing" || it.status === "pending" ||
        it.isolationStatus === "isolating" || it.isolationStatus === "pending")
  ).length;

  return (
    <div>
      {/* Drop zone — always shown so user can add more */}
      <div
        className="upload-zone"
        style={{ minHeight: 140, marginBottom: 28 }}
        onClick={() => batchInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload multiple garment images"
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); batchInputRef.current?.click(); } }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) handleBatchFiles(e.dataTransfer.files); }}
      >
        <div className="upload-icon"><Layers size={22} /></div>
        <h3>Upload multiple photos</h3>
        <p>Select up to 20 images — AI will analyse each one automatically.</p>
        <button className="btn btn-secondary btn-sm" type="button">
          <Image size={13} />
          {items.length > 0 ? "Add more images" : "Choose images"}
        </button>
        <input
          ref={batchInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { if (e.target.files?.length) handleBatchFiles(e.target.files); e.target.value = ""; }}
          aria-label="Batch file upload input"
        />
      </div>
      {batchNotice && (
        <p style={{ fontSize: 12, color: "var(--rose)", marginTop: -18, marginBottom: 20 }} role="alert">
          {batchNotice}
        </p>
      )}

      {/* Items grid */}
      {items.length > 0 && (
        <>
          {/* Summary bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 18,
              padding: "12px 16px",
              background: "var(--cream-dark)",
              borderRadius: "var(--r-lg)",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ fontSize: 13, color: "var(--espresso)" }}>
              <strong>{items.length}</strong> photo{items.length !== 1 ? "s" : ""} •{" "}
              {analysing > 0 ? (
                <span style={{ color: "var(--brown-soft)" }}>
                  <Loader2 size={12} style={{ display: "inline", marginRight: 4, animation: "spin 1s linear infinite", verticalAlign: "middle" }} />
                  Analysing {analysing}…
                </span>
              ) : (
                <span style={{ color: "var(--green, #4a7c59)" }}>
                  {approvedItems.length} approved for save
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setItems((prev) => prev.map((it) => ({ ...it, approved: true })))}
                type="button"
              >
                Select all
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  items.forEach((it) => URL.revokeObjectURL(it.previewUrl));
                  setItems([]);
                  setBatchSaveState("idle");
                }}
                type="button"
              >
                Clear all
              </button>
            </div>
          </div>

          {/* Cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 28 }}>
            {items.map((item) => {
              const isExpanded = expandedId === item.id;
              const itemValid = item.form.name.trim() && item.form.category;
              return (
                <div
                  key={item.id}
                  style={{
                    border: `1px solid ${item.approved ? "var(--border)" : "var(--rose-light, #e8b4b8)"}`,
                    borderRadius: "var(--r-xl)",
                    overflow: "hidden",
                    background: item.approved ? "var(--white)" : "var(--rose-pale, #fdf0f0)",
                    opacity: item.approved ? 1 : 0.7,
                    transition: "all 0.2s ease",
                  }}
                >
                  {/* Card header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "14px 16px",
                    }}
                  >
                    {/* Thumbnail with click to enlarge */}
                    <div
                      style={{ position: "relative", cursor: "pointer" }}
                      onClick={() => {
                        setInspectItem(item);
                        setInspectMode("isolated");
                      }}
                      title="Click to inspect isolated image in high resolution"
                      role="button"
                      tabIndex={0}
                    >
                      <img
                        src={item.previewUrl}
                        alt="Garment thumbnail"
                        style={{
                          width: 64,
                          height: 64,
                          objectFit: "contain",
                          backgroundColor: "var(--cream-mid)",
                          borderRadius: "var(--r-md)",
                          flexShrink: 0,
                          border: "1px solid var(--border-light)",
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          bottom: 2,
                          right: 2,
                          backgroundColor: "rgba(30, 20, 15, 0.75)",
                          color: "white",
                          borderRadius: "var(--r-xs, 4px)",
                          padding: "1px 4px",
                          fontSize: 9,
                          fontWeight: 500,
                        }}
                      >
                        Inspect
                      </div>
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {item.status === "analysing" ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Loader2 size={14} style={{ animation: "spin 1s linear infinite", color: "var(--brown-soft)", flexShrink: 0 }} />
                          <span style={{ fontSize: 13, color: "var(--brown-soft)" }}>Analysing…</span>
                        </div>
                      ) : item.status === "error" ? (
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--rose)", marginBottom: 2 }}>
                            Analysis failed
                          </div>
                          <div style={{ fontSize: 12, color: "var(--brown-muted)" }}>
                            {item.error} Retry, or click <strong>Edit</strong> to fill in the details.
                          </div>
                          {!itemValid && item.approved && (
                            <div style={{ fontSize: 11, color: "var(--rose)", marginTop: 3 }}>
                              ⚠ Name and category required before saving
                            </div>
                          )}
                        </div>
                      ) : item.status === "done" ? (
                        <div>
                          <div
                            style={{
                              fontSize: 13.5,
                              fontWeight: 600,
                              color: "var(--espresso)",
                              marginBottom: 2,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {item.form.name || item.analysis?.subcategory || "Unnamed item"}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--brown-muted)" }}>
                            {[item.form.style_branch, item.form.subcategory].filter(Boolean).join(" · ")}
                            {item.form.color && ` · ${item.form.color}`}
                          </div>
                          {!itemValid && item.approved && (
                            <div style={{ fontSize: 11, color: "var(--rose)", marginTop: 3 }}>
                              ⚠ Name and category required before saving
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: "var(--brown-muted)" }}>Waiting to analyse…</div>
                      )}
                      <div style={{ fontSize: 11, color: "var(--brown-muted)", marginTop: 3 }}>
                        {item.saved
                          ? "✓ Added to closet"
                          : item.isolationStatus === "isolating"
                            ? "Removing background…"
                            : item.isolationStatus === "done" && item.isolationQuality === "clean"
                              ? "✨ Background removed"
                              : item.isolationStatus === "done"
                                ? item.useIsolated
                                  ? "Unreliable cut-out chosen — background-removed image will be saved"
                                  : `Background removal unreliable${item.isolationIssue ? `: ${item.isolationIssue.replace(/\.$/, "").toLowerCase()}` : ""} — original selected (Inspect to change)`
                                : item.isolationStatus === "error"
                                  ? `${item.isolationError ?? "Background removal failed."} Original will be saved.`
                                  : null}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      {item.status === "error" && !item.saved && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => runItemAnalysis(item.id, item.file)}
                          style={{ fontSize: 12, padding: "4px 9px" }}
                        >
                          Retry
                        </button>
                      )}
                      {(item.status === "done" || item.status === "error") && !item.saved && (
                        <>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setInspectItem(item);
                              setInspectMode("isolated");
                            }}
                            style={{ fontSize: 12, padding: "4px 9px" }}
                            title="Inspect isolated image in high resolution"
                          >
                            <Eye size={12} />
                            Inspect
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setExpandedId(isExpanded ? null : item.id)}
                            style={{ fontSize: 12 }}
                          >
                            <Edit3 size={12} />
                            {isExpanded ? "Collapse" : "Edit"}
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleApproval(item.id)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 4,
                          color: item.approved ? "var(--green, #4a7c59)" : "var(--rose)",
                        }}
                        aria-label={item.approved ? "Reject item" : "Approve item"}
                        title={item.approved ? "Click to reject" : "Click to approve"}
                      >
                        {item.approved ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => removeItem(item.id)}
                        aria-label="Remove item"
                        style={{ color: "var(--brown-muted)" }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded edit panel */}
                  {isExpanded && (item.status === "done" || item.status === "error") && !item.saved && (
                    <div
                      style={{
                        padding: "16px 20px 20px",
                        borderTop: "1px solid var(--border-light)",
                        background: "var(--cream)",
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "12px 20px",
                      }}
                    >
                      {/* Name */}
                      <div className="form-group" style={{ marginBottom: 0, gridColumn: "1 / -1" }}>
                        <label className="form-label" htmlFor={`name-${item.id}`}>
                          Name <span style={{ color: "var(--rose)" }}>*</span>
                        </label>
                        <input
                          id={`name-${item.id}`}
                          className="form-input"
                          value={item.form.name}
                          onChange={(e) => updateBatchForm(item.id, "name", e.target.value)}
                          placeholder="Item name"
                        />
                      </div>

                      {/* Style Branch */}
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Style Branch</label>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {STYLE_BRANCHES.map((b) => (
                            <button
                              key={b}
                              type="button"
                              className={`filter-chip${item.form.style_branch === b ? " active" : ""}`}
                              style={{ fontSize: 11, padding: "4px 10px" }}
                              onClick={() => updateBatchForm(item.id, "style_branch", item.form.style_branch === b ? "" : b)}
                            >
                              {b}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Subcategory */}
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" htmlFor={`sub-${item.id}`}>Type</label>
                        <input
                          id={`sub-${item.id}`}
                          className="form-input"
                          value={item.form.subcategory}
                          onChange={(e) => updateBatchForm(item.id, "subcategory", e.target.value)}
                          placeholder="e.g. Saree, Jeans"
                        />
                      </div>

                      {/* Category */}
                      <div className="form-group" style={{ marginBottom: 0, position: "relative" }}>
                        <label className="form-label" htmlFor={`cat-${item.id}`}>
                          Category <span style={{ color: "var(--rose)" }}>*</span>
                        </label>
                        <select
                          id={`cat-${item.id}`}
                          className="form-select"
                          value={item.form.category}
                          onChange={(e) => updateBatchForm(item.id, "category", e.target.value)}
                        >
                          <option value="">Select…</option>
                          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </div>

                      {/* Color */}
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" htmlFor={`color-${item.id}`}>Colour</label>
                        <input
                          id={`color-${item.id}`}
                          className="form-input"
                          value={item.form.color}
                          onChange={(e) => updateBatchForm(item.id, "color", e.target.value)}
                          placeholder="e.g. Red, Navy"
                        />
                      </div>

                      {/* Material */}
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" htmlFor={`mat-${item.id}`}>Material</label>
                        <input
                          id={`mat-${item.id}`}
                          className="form-input"
                          value={item.form.material}
                          onChange={(e) => updateBatchForm(item.id, "material", e.target.value)}
                          placeholder="e.g. Silk, Cotton"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Save all approved */}
          {batchSaveState === "error" && batchSaveError && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "12px 14px",
                background: "var(--rose-pale)",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--rose-light)",
                marginBottom: 14,
              }}
            >
              <AlertCircle size={15} style={{ color: "var(--rose)", flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13, color: "var(--espresso)" }}>{batchSaveError}</span>
            </div>
          )}

          <button
            type="button"
            className={`btn ${batchSaveState === "done" ? "btn-secondary" : "btn-primary"}`}
            style={{ width: "100%" }}
            disabled={!canSave || batchSaveState === "saving" || batchSaveState === "done" || analysing > 0}
            onClick={handleBatchSave}
            id="batch-save-btn"
          >
            {batchSaveState === "saving" ? (
              <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />{saveProgress ? `Adding item ${saveProgress.current} of ${saveProgress.total} to Closet…` : `Adding ${approvedItems.length} items to Closet…`}</>
            ) : batchSaveState === "done" ? (
              <><Check size={14} />Added to Closet! Redirecting…</>
            ) : analysing > 0 ? (
              <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />Analysing — please wait…</>
            ) : approvedItems.length === 0 ? (
              <><Package size={14} />No approved items to add</>
            ) : (
              <><Package size={14} />Add {approvedItems.length} approved item{approvedItems.length !== 1 ? "s" : ""} to Closet</>
            )}
          </button>
          {!canSave && approvedItems.length > 0 && (
            <p style={{ fontSize: 12, color: "var(--brown-muted)", textAlign: "center", marginTop: 8 }}>
              Each item needs a name and category before saving. Click <strong>Edit</strong> on any item to fix it.
            </p>
          )}

        </>
      )}

      {/* Batch Item Inspection Modal */}
      {inspectItem && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(30, 20, 15, 0.7)",
            backdropFilter: "blur(6px)",
            zIndex: 1100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setInspectItem(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: 580,
              backgroundColor: "var(--white)",
              borderRadius: "var(--r-xl)",
              overflow: "hidden",
              boxShadow: "var(--shadow-lg)",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--border-light)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--espresso)", margin: 0 }}>
                  {inspectItem.form.name || inspectItem.analysis?.subcategory || "Batch Item Preview"}
                </h3>
                <div style={{ fontSize: 12, color: "var(--brown-muted)", marginTop: 2 }}>
                  {inspectItem.form.category} • {inspectItem.form.style_branch || "Style"}
                </div>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setInspectItem(null)}
                style={{ color: "var(--brown-muted)" }}
                aria-label="Close preview"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "20px", textAlign: "center" }}>
              {/* Toggle Preview Mode */}
              <div
                style={{
                  display: "inline-flex",
                  background: "var(--cream-mid)",
                  padding: 3,
                  borderRadius: "var(--r-full)",
                  marginBottom: 16,
                }}
              >
                <button
                  type="button"
                  className={`btn btn-sm ${inspectMode === "isolated" ? "btn-primary" : "btn-ghost"}`}
                  style={{ padding: "4px 14px", fontSize: 12, borderRadius: "var(--r-full)" }}
                  onClick={() => setInspectMode("isolated")}
                >
                  Isolated (
                  {inspectItem.isolationStatus === "done"
                    ? inspectItem.isolationQuality === "clean" ? "Background removed" : "Unreliable"
                    : inspectItem.isolationStatus === "error" ? "Failed" : "Processing"}
                  )
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${inspectMode === "original" ? "btn-primary" : "btn-ghost"}`}
                  style={{ padding: "4px 14px", fontSize: 12, borderRadius: "var(--r-full)" }}
                  onClick={() => setInspectMode("original")}
                >
                  Original Image
                </button>
              </div>

              {/* Image Display */}
              <div
                style={{
                  width: "100%",
                  height: 360,
                  borderRadius: "var(--r-lg)",
                  background:
                    inspectMode === "isolated"
                      ? "repeating-conic-gradient(#f0ebe1 0% 25%, #faf8f5 0% 50%) 50% / 20px 20px"
                      : "var(--cream-mid)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  border: "1px solid var(--border-light)",
                }}
              >
                <img
                  src={inspectMode === "isolated" && inspectItem.isolatedFile ? inspectItem.previewUrl : inspectItem.rawPreviewUrl}
                  alt="Garment preview"
                  style={{
                    maxWidth: "92%",
                    maxHeight: "92%",
                    objectFit: "contain",
                  }}
                />
              </div>

              <div style={{ marginTop: 12, fontSize: 12, color: "var(--brown-muted)" }}>
                {inspectMode === "isolated"
                  ? inspectItem.isolatedFile
                    ? "Isolated subject with the background made transparent."
                    : "No background-removed version is available for this photo."
                  : "Original source photo before segmentation."}
              </div>
              {inspectItem.isolatedFile && (
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12, color: "var(--espresso)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={inspectItem.useIsolated}
                    onChange={(e) => setUseIsolated(inspectItem.id, e.target.checked)}
                  />
                  Save the background-removed version
                </label>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "14px 20px",
                borderTop: "1px solid var(--border-light)",
                backgroundColor: "var(--cream-light, #faf8f5)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  toggleApproval(inspectItem.id);
                  setInspectItem(null);
                }}
              >
                {inspectItem.approved ? "Reject Item" : "Approve Item"}
              </button>

              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setInspectItem(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*  MAIN BUILD PAGE                                              */
/* ══════════════════════════════════════════════════════════════ */
export default function Build() {
  const [mode, setMode] = useState<PageMode>("single");

  return (
    <div className="app-shell">
      <Navbar />
      <main className="page-content">
        <div className="page">
          {/* Header */}
          <div className="page-header">
            <div className="page-header-left">
              <div className="eyebrow">Digitize</div>
              <h1 className="page-title">Add to My Closet</h1>
            </div>
          </div>

          {/* Mode tabs */}
          <div className="tab-bar" style={{ marginBottom: 28 }}>
            <button
              className={`tab-item${mode === "single" ? " active" : ""}`}
              onClick={() => setMode("single")}
              id="single-mode-tab"
            >
              Single Item
            </button>
            <button
              className={`tab-item${mode === "batch" ? " active" : ""}`}
              onClick={() => setMode("batch")}
              id="batch-mode-tab"
            >
              Batch Upload
            </button>
          </div>

          {mode === "single" ? <SingleItemMode /> : <BatchMode />}
        </div>
      </main>
    </div>
  );
}
