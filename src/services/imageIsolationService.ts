/**
 * imageIsolationService.ts
 * Background removal for wardrobe photos using neural segmentation
 * (@imgly/background-removal, ISNet model, runs in the browser).
 *
 * - Works without the Gemini analysis. When analysis supplies a bounding
 *   box, the photo is first cropped to that item so other subjects in the
 *   scene (people, furniture, display cases) are less likely to be kept.
 * - The result is checked pixel by pixel: it only counts as a success if the
 *   output really has a transparent background and a visible item.
 * - There is no silent fallback. If segmentation fails, a
 *   BackgroundRemovalError is thrown and callers keep the original photo.
 * - Transparent margins are trimmed so the item fills its card.
 */
import { removeBackground, type Config } from "@imgly/background-removal";

export interface IsolationResult {
  /** Transparent PNG ready for Supabase Storage */
  file: File;
  /** Blob URL for preview rendering */
  previewUrl: string;
  /** Share of the output's pixels that are transparent (0–1) */
  transparentRatio: number;
  /**
   * "uncertain" when the cut-out failed a quality check: background was
   * kept, part of the item was erased, or the item is mostly semi-transparent.
   */
  quality: "clean" | "uncertain";
  /** Why the result is uncertain, in words the user can act on */
  issue?: string;
}

/** Item bounding box inside the image that was segmented, in pixels */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class BackgroundRemovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackgroundRemovalError";
  }
}

const CONFIG: Config = {
  // Model files are fetched once from IMG.LY's CDN, then cached by the browser
  publicPath: "https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/",
  model: "isnet_fp16",
  output: { format: "image/png", quality: 1 },
};

/** First run downloads the model, which can take a while on slow connections */
const TIMEOUT_MS = 120_000;
/** Longest edge of the stored PNG */
const MAX_OUTPUT_EDGE = 2048;
/** Alpha below this counts as background */
const TRANSPARENT_ALPHA = 16;
/** Alpha above this counts as solid item */
const OPAQUE_ALPHA = 240;
/** Below this share of solid pixels (of all kept pixels) the cut-out is uncertain */
const MIN_SOLID_SHARE = 0.65;
/** Above this share of kept pixels outside the item's box, background was kept */
const MAX_OUTSIDE_KEPT = 0.25;
/** Below this share of the box's width or height, part of the item was erased */
const MIN_BOX_SPAN = 0.6;
/** Without a box: above this share of kept pixels along the photo's edges, background was kept */
const MAX_EDGE_KEPT = 0.4;

// One segmentation at a time: each run holds the model and full-size buffers in memory
let queue: Promise<unknown> = Promise.resolve();

/**
 * @param box2d Optional Gemini bounding box [ymin, xmin, ymax, xmax] (0–1000)
 */
export function isolateGarment(
  source: File,
  box2d?: [number, number, number, number]
): Promise<IsolationResult> {
  const task = queue.then(() => runIsolation(source, box2d));
  queue = task.catch(() => undefined);
  return task;
}

async function runIsolation(
  source: File,
  box2d?: [number, number, number, number]
): Promise<IsolationResult> {
  let segmented: Blob;
  let itemBox: Rect | undefined;
  try {
    const cropped = box2d ? await cropToBox(source, box2d) : null;
    itemBox = cropped?.box;
    segmented = await withTimeout(removeBackground(cropped?.blob ?? source, CONFIG), TIMEOUT_MS);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new BackgroundRemovalError(`Background removal failed: ${reason}`);
  }

  const { blob, transparentRatio, quality, issue } = await verifyAndTrim(segmented, itemBox);
  const baseName = source.name.replace(/\.[^/.]+$/, "") || "garment";
  const file = new File([blob], `${baseName}-isolated.png`, { type: "image/png" });
  return { file, previewUrl: URL.createObjectURL(blob), transparentRatio, quality, issue };
}

/**
 * Crops the photo to the bounding box plus an 8% margin, and reports where
 * the box lies inside the crop. Returns null when the box is unusable or
 * already covers nearly the whole photo.
 */
async function cropToBox(
  source: File,
  [ymin, xmin, ymax, xmax]: [number, number, number, number]
): Promise<{ blob: Blob; box: Rect } | null> {
  if (ymin >= ymax || xmin >= xmax) return null;
  if ((xmax - xmin) / 1000 > 0.9 && (ymax - ymin) / 1000 > 0.9) return null;

  const bitmap = await createImageBitmap(source).catch(() => null);
  if (!bitmap) return null;
  const { width, height } = bitmap;
  const boxW = ((xmax - xmin) * width) / 1000;
  const boxH = ((ymax - ymin) * height) / 1000;
  const padX = boxW * 0.08;
  const padY = boxH * 0.08;
  const cropX = Math.max(0, Math.floor((xmin * width) / 1000 - padX));
  const cropY = Math.max(0, Math.floor((ymin * height) / 1000 - padY));
  const cropW = Math.min(width - cropX, Math.ceil(boxW + padX * 2));
  const cropH = Math.min(height - cropY, Math.ceil(boxH + padY * 2));
  if (cropW < 64 || cropH < 64) {
    bitmap.close();
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) return null;
  return {
    blob,
    box: { x: (xmin * width) / 1000 - cropX, y: (ymin * height) / 1000 - cropY, w: boxW, h: boxH },
  };
}

/**
 * Confirms the segmentation produced a transparent background around a
 * visible item, checks it for kept background or erased parts, then crops
 * away fully transparent margins.
 */
async function verifyAndTrim(
  segmented: Blob,
  itemBox?: Rect
): Promise<{ blob: Blob; transparentRatio: number; quality: IsolationResult["quality"]; issue?: string }> {
  const bitmap = await createImageBitmap(segmented);
  const { width, height } = bitmap;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new BackgroundRemovalError("Background removal failed: canvas unavailable.");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, width, height);

  // Item box with a small tolerance, and the photo's outer edge band
  const tol = itemBox ? Math.max(itemBox.w, itemBox.h) * 0.03 : 0;
  const bx0 = itemBox ? itemBox.x - tol : 0;
  const by0 = itemBox ? itemBox.y - tol : 0;
  const bx1 = itemBox ? itemBox.x + itemBox.w + tol : width;
  const by1 = itemBox ? itemBox.y + itemBox.h + tol : height;
  const edge = Math.max(2, Math.round(Math.min(width, height) * 0.03));

  let transparent = 0;
  let solid = 0;
  let outside = 0, outsideKept = 0, edgePx = 0, edgeKept = 0;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  let inMinX = width, inMinY = height, inMaxX = -1, inMaxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      const kept = alpha >= TRANSPARENT_ALPHA;
      const inBox = x >= bx0 && x < bx1 && y >= by0 && y < by1;
      const onEdge = x < edge || y < edge || x >= width - edge || y >= height - edge;
      if (!inBox) {
        outside++;
        if (kept) outsideKept++;
      }
      if (onEdge) {
        edgePx++;
        if (kept) edgeKept++;
      }
      if (!kept) {
        transparent++;
      } else {
        if (alpha > OPAQUE_ALPHA) solid++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (inBox) {
          if (x < inMinX) inMinX = x;
          if (x > inMaxX) inMaxX = x;
          if (y < inMinY) inMinY = y;
          if (y > inMaxY) inMaxY = y;
        }
      }
    }
  }

  const total = width * height;
  const transparentRatio = transparent / total;
  const keptRatio = 1 - transparentRatio;

  if (maxX < 0 || keptRatio < 0.005) {
    throw new BackgroundRemovalError(
      "Background removal could not find the item in this photo."
    );
  }
  if (transparentRatio < 0.02) {
    throw new BackgroundRemovalError(
      "Background removal could not separate the item from its background."
    );
  }

  // Crop to the item with a small margin, and cap the stored size
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.02);
  const cropX = Math.max(0, minX - pad);
  const cropY = Math.max(0, minY - pad);
  const cropW = Math.min(width, maxX + pad + 1) - cropX;
  const cropH = Math.min(height, maxY + pad + 1) - cropY;
  const scale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(cropW, cropH));

  const out = document.createElement("canvas");
  out.width = Math.round(cropW * scale);
  out.height = Math.round(cropH * scale);
  const outCtx = out.getContext("2d");
  if (!outCtx) throw new BackgroundRemovalError("Background removal failed: canvas unavailable.");
  outCtx.imageSmoothingQuality = "high";
  outCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, out.width, out.height);

  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/png"));
  if (!blob) throw new BackgroundRemovalError("Background removal failed: could not encode PNG.");

  let issue: string | undefined;
  if (itemBox && outside > 0 && outsideKept / outside > MAX_OUTSIDE_KEPT) {
    issue = "Some of the background around the item was kept.";
  } else if (!itemBox && edgeKept / edgePx > MAX_EDGE_KEPT) {
    issue = "Some of the background around the item was kept.";
  } else if (
    itemBox &&
    (inMaxX < 0 ||
      (inMaxX - inMinX + 1) / itemBox.w < MIN_BOX_SPAN ||
      (inMaxY - inMinY + 1) / itemBox.h < MIN_BOX_SPAN)
  ) {
    issue = "Part of the item may have been removed with the background.";
  } else if (solid / (total - transparent) < MIN_SOLID_SHARE) {
    issue = "The item's edges came out faint or see-through.";
  }

  return { blob, transparentRatio, quality: issue ? "uncertain" : "clean", issue };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out after ${Math.round(ms / 1000)}s`)),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
