/**
 * geminiService.ts
 * Analyses a clothing/fashion photo and returns structured taxonomy.
 *
 * The Gemini call runs server-side in the "analyze-garment" Edge Function,
 * so no Gemini API key is shipped to the browser.
 */
import { invokeFunction } from "./edgeFunctions";

export interface GarmentAnalysis {
  /** "Traditional" | "Indo-Western" | "Western" | "Unknown" */
  style_branch: string;
  /** e.g. "Clothing" | "Footwear" | "Bags" | "Jewellery" | "Accessories" | "Other" */
  major_category: string;
  /** e.g. "Saree" | "Kurti" | "Jeans" | "Sneakers" */
  subcategory: string;
  /** Human-readable name suggestion */
  suggested_name: string;
  color: string;
  material: string;
  pattern: string;
  occasion: string;
  style: string;
  /** Normalized bounding box [ymin, xmin, ymax, xmax] 0-1000 */
  box_2d?: [number, number, number, number];
  /** 0–1 confidence */
  confidence: number;
}

/** Longest edge sent for analysis; plenty for recognition, keeps uploads small */
const ANALYSIS_MAX_EDGE = 1600;

export async function analyseGarmentImage(
  base64Data: string,
  mimeType: string
): Promise<GarmentAnalysis> {
  const data = await invokeFunction<{ analysis?: GarmentAnalysis }>("analyze-garment", {
    image: base64Data,
    mimeType,
  });
  if (!data?.analysis) {
    throw new Error("The AI service returned no analysis for this image.");
  }
  return data.analysis;
}

export async function fileToBase64(
  file: File | Blob
): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, base64] = result.split(",");
      const mimeType = header.split(":")[1].split(";")[0];
      resolve({ base64, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Prepares a photo for analysis: downscales it to at most 1600px as JPEG.
 * Falls back to the original bytes when the browser cannot decode the format
 * (e.g. HEIC outside Safari); the server still accepts those.
 */
export async function encodeImageForAnalysis(
  file: File
): Promise<{ base64: string; mimeType: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, ANALYSIS_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    // White behind transparent PNGs so JPEG encoding doesn't turn them black
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (!blob) throw new Error("Encoding failed");
    return await fileToBase64(blob);
  } catch {
    return fileToBase64(file);
  }
}
