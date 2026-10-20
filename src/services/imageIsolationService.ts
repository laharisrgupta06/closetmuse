/**
 * imageIsolationService.ts
 * Background removal for wardrobe photos using neural segmentation
 * (@imgly/background-removal, ISNet model, runs in the browser).
 *
 * Pipeline:
 * 1. Optionally crop to the Gemini bounding box (so other subjects in the
 *    scene are less likely to be kept) and cap the size at 2048px.
 * 2. Ask the model for its mask only (segmentForeground).
 * 3. Refine the mask. The model's raw output is a soft confidence map; used
 *    directly as alpha (as removeBackground does) every uncertain region of
 *    the garment becomes see-through, which washes out denim, light fabrics,
 *    chains and straps. Refinement makes confident areas fully opaque, keeps
 *    a short ramp for smooth edges, fills enclosed gaps the model was unsure
 *    about, and drops stray specks far from the item.
 * 4. Apply the refined alpha to the ORIGINAL pixels, so colours, texture and
 *    stitching are never faded.
 * 5. Verify the result. There is no silent fallback: unusable output throws a
 *    BackgroundRemovalError, doubtful output is returned as "uncertain" with
 *    the reason, and callers keep the original photo selected.
 */
import { segmentForeground, type Config } from "@imgly/background-removal";

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

export interface IsolationOptions {
  /** Thin items (necklaces, earrings, belts) legitimately fill little of their box */
  thinItem?: boolean;
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
/** Longest edge segmented and stored */
const MAX_EDGE = 2048;

// Mask refinement (mask values 0–255)
/** At or above this the model is confident the pixel is the item */
const MASK_SOLID = 128;
/** At or below this the pixel is background */
const MASK_CLEAR = 24;
/** Enclosed gaps with at least this mean mask value were uncertain, not empty: fill them */
const HOLE_FILL_MIN_MEAN = 32;
/** Never fill an enclosed gap larger than this share of the item */
const HOLE_FILL_MAX_SHARE = 0.2;

// Quality checks (on the refined alpha)
const TRANSPARENT_ALPHA = 16;
const OPAQUE_ALPHA = 240;
/** Above this share of semi-transparent pixels the cut-out looks faded */
const MAX_PARTIAL_SHARE = 0.3;
/** Above this share of kept pixels outside the item's box, background was kept */
const MAX_OUTSIDE_KEPT = 0.25;
/** Below this share of the box's width or height, part of the item was erased */
const MIN_BOX_SPAN = 0.6;
/** Below this share of the box covered, most of the item is missing */
const MIN_BOX_COVERAGE = 0.15;
const MIN_BOX_COVERAGE_THIN = 0.03;
/** Without a box: above this share of kept pixels along the photo's edges, background was kept */
const MAX_EDGE_KEPT = 0.4;

// One segmentation at a time: each run holds the model and full-size buffers in memory
let queue: Promise<unknown> = Promise.resolve();

/**
 * @param box2d Optional Gemini bounding box [ymin, xmin, ymax, xmax] (0–1000)
 */
export function isolateGarment(
  source: File,
  box2d?: [number, number, number, number],
  options: IsolationOptions = {}
): Promise<IsolationResult> {
  const task = queue.then(() => runIsolation(source, box2d, options));
  queue = task.catch(() => undefined);
  return task;
}

async function runIsolation(
  source: File,
  box2d: [number, number, number, number] | undefined,
  options: IsolationOptions
): Promise<IsolationResult> {
  // 1. Prepare the input once (crop + size cap); the original file is never modified
  const prepared = await prepareInput(source, box2d);

  // 2. Model mask
  let maskBlob: Blob;
  try {
    maskBlob = await withTimeout(segmentForeground(prepared.blob, CONFIG), TIMEOUT_MS);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new BackgroundRemovalError(`Background removal failed: ${reason}`);
  }

  // 3–4. Refine and apply to the original pixels
  const { width, height, pixels } = prepared;
  const maskBitmap = await createImageBitmap(maskBlob);
  const maskCanvas = makeCanvas(width, height);
  maskCanvas.ctx.drawImage(maskBitmap, 0, 0, width, height);
  maskBitmap.close();
  const maskData = maskCanvas.ctx.getImageData(0, 0, width, height).data;
  const mask = new Uint8ClampedArray(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = maskData[i * 4 + 3];

  const alpha = refineMask(mask, width, height);
  for (let i = 0; i < alpha.length; i++) pixels.data[i * 4 + 3] = alpha[i];

  // 5. Verify, trim and encode
  const { blob, transparentRatio, quality, issue } = await verifyAndTrim(
    pixels,
    prepared.box,
    options.thinItem ?? false
  );
  const baseName = source.name.replace(/\.[^/.]+$/, "") || "garment";
  const file = new File([blob], `${baseName}-isolated.png`, { type: "image/png" });
  return { file, previewUrl: URL.createObjectURL(blob), transparentRatio, quality, issue };
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new BackgroundRemovalError("Background removal failed: canvas unavailable.");
  return { canvas, ctx };
}

/**
 * Decodes the photo once, crops it to the box (plus an 8% margin) when one is
 * given and useful, and caps the longest edge. Returns the exact pixels that
 * are segmented, so the cut-out keeps their original colours.
 */
async function prepareInput(
  source: File,
  box2d?: [number, number, number, number]
): Promise<{ blob: Blob; pixels: ImageData; width: number; height: number; box?: Rect }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    throw new BackgroundRemovalError("Background removal failed: this image format can't be read by the browser.");
  }
  const imgW = bitmap.width;
  const imgH = bitmap.height;

  let cropX = 0, cropY = 0, cropW = imgW, cropH = imgH;
  let box: Rect | undefined;
  if (box2d) {
    const [ymin, xmin, ymax, xmax] = box2d;
    const usable = ymin < ymax && xmin < xmax;
    const nearlyFull = (xmax - xmin) / 1000 > 0.9 && (ymax - ymin) / 1000 > 0.9;
    if (usable && nearlyFull) {
      // No crop needed, but keep the box: the quality checks still use it
      box = { x: (xmin * imgW) / 1000, y: (ymin * imgH) / 1000, w: ((xmax - xmin) * imgW) / 1000, h: ((ymax - ymin) * imgH) / 1000 };
    } else if (usable) {
      const boxW = ((xmax - xmin) * imgW) / 1000;
      const boxH = ((ymax - ymin) * imgH) / 1000;
      const x = Math.max(0, Math.floor((xmin * imgW) / 1000 - boxW * 0.08));
      const y = Math.max(0, Math.floor((ymin * imgH) / 1000 - boxH * 0.08));
      const w = Math.min(imgW - x, Math.ceil(boxW * 1.16));
      const h = Math.min(imgH - y, Math.ceil(boxH * 1.16));
      if (w >= 64 && h >= 64) {
        cropX = x; cropY = y; cropW = w; cropH = h;
        box = { x: (xmin * imgW) / 1000 - x, y: (ymin * imgH) / 1000 - y, w: boxW, h: boxH };
      }
    }
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(cropW, cropH));
  const width = Math.max(1, Math.round(cropW * scale));
  const height = Math.max(1, Math.round(cropH * scale));
  const { canvas, ctx } = makeCanvas(width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, width, height);
  bitmap.close();
  if (box) box = { x: box.x * scale, y: box.y * scale, w: box.w * scale, h: box.h * scale };

  const pixels = ctx.getImageData(0, 0, width, height);
  for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = 255; // opaque source
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new BackgroundRemovalError("Background removal failed: could not prepare the image.");
  return { blob, pixels, width, height, box };
}

/**
 * Turns the model's soft confidence map into a clean alpha channel.
 * Exported for tests.
 */
export function refineMask(mask: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const n = width * height;
  const stack = new Int32Array(n);

  // a) Connected regions the model is confident about; drop tiny specks
  const labels = new Int32Array(n).fill(-1);
  const areas: number[] = [];
  for (let start = 0; start < n; start++) {
    if (mask[start] < MASK_SOLID || labels[start] !== -1) continue;
    const id = areas.length;
    let top = 0;
    let area = 0;
    stack[top++] = start;
    labels[start] = id;
    while (top > 0) {
      const p = stack[--top];
      area++;
      const x = p % width;
      if (p >= width && labels[p - width] === -1 && mask[p - width] >= MASK_SOLID) { labels[p - width] = id; stack[top++] = p - width; }
      if (p < n - width && labels[p + width] === -1 && mask[p + width] >= MASK_SOLID) { labels[p + width] = id; stack[top++] = p + width; }
      if (x > 0 && labels[p - 1] === -1 && mask[p - 1] >= MASK_SOLID) { labels[p - 1] = id; stack[top++] = p - 1; }
      if (x < width - 1 && labels[p + 1] === -1 && mask[p + 1] >= MASK_SOLID) { labels[p + 1] = id; stack[top++] = p + 1; }
    }
    areas.push(area);
  }
  const largest = areas.reduce((a, b) => Math.max(a, b), 0);
  const minArea = Math.max(largest * 0.02, n * 0.0003);
  const keep = areas.map((a) => a >= minArea);

  // b) Only pixels near a kept region may be (partly) visible
  const radius = Math.round(Math.max(width, height) * 0.012) + 2;
  const dist = new Float32Array(n).fill(1e9);
  for (let p = 0; p < n; p++) if (labels[p] !== -1 && keep[labels[p]]) dist[p] = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (x > 0 && dist[p - 1] + 1 < dist[p]) dist[p] = dist[p - 1] + 1;
      if (y > 0 && dist[p - width] + 1 < dist[p]) dist[p] = dist[p - width] + 1;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const p = y * width + x;
      if (x < width - 1 && dist[p + 1] + 1 < dist[p]) dist[p] = dist[p + 1] + 1;
      if (y < height - 1 && dist[p + width] + 1 < dist[p]) dist[p] = dist[p + width] + 1;
    }
  }

  // c) Confident = solid, uncertain = short ramp (smooth edges), rest clear
  const alpha = new Uint8ClampedArray(n);
  let keptArea = 0;
  for (let p = 0; p < n; p++) {
    if (dist[p] > radius) continue;
    const m = mask[p];
    alpha[p] =
      m >= MASK_SOLID ? 255 : m <= MASK_CLEAR ? 0 : Math.round(((m - MASK_CLEAR) / (MASK_SOLID - MASK_CLEAR)) * 255);
    if (alpha[p] >= 128) keptArea++;
  }

  // d) Fill enclosed gaps the model was unsure about (faded garment areas);
  //    leave confidently empty holes (bag handles, the inside of a necklace)
  const outside = new Uint8Array(n);
  let top = 0;
  const pushIfOpen = (p: number) => {
    if (!outside[p] && alpha[p] < 128) {
      outside[p] = 1;
      stack[top++] = p;
    }
  };
  for (let x = 0; x < width; x++) {
    pushIfOpen(x);
    pushIfOpen((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    pushIfOpen(y * width);
    pushIfOpen(y * width + width - 1);
  }
  while (top > 0) {
    const p = stack[--top];
    const x = p % width;
    if (p >= width) pushIfOpen(p - width);
    if (p < n - width) pushIfOpen(p + width);
    if (x > 0) pushIfOpen(p - 1);
    if (x < width - 1) pushIfOpen(p + 1);
  }
  const seen = new Uint8Array(n);
  const hole: number[] = [];
  for (let start = 0; start < n; start++) {
    if (outside[start] || seen[start] || alpha[start] >= 128) continue;
    hole.length = 0;
    let sum = 0;
    top = 0;
    stack[top++] = start;
    seen[start] = 1;
    while (top > 0) {
      const p = stack[--top];
      hole.push(p);
      sum += mask[p];
      const x = p % width;
      if (p >= width && !seen[p - width] && !outside[p - width] && alpha[p - width] < 128) { seen[p - width] = 1; stack[top++] = p - width; }
      if (p < n - width && !seen[p + width] && !outside[p + width] && alpha[p + width] < 128) { seen[p + width] = 1; stack[top++] = p + width; }
      if (x > 0 && !seen[p - 1] && !outside[p - 1] && alpha[p - 1] < 128) { seen[p - 1] = 1; stack[top++] = p - 1; }
      if (x < width - 1 && !seen[p + 1] && !outside[p + 1] && alpha[p + 1] < 128) { seen[p + 1] = 1; stack[top++] = p + 1; }
    }
    if (sum / hole.length >= HOLE_FILL_MIN_MEAN && hole.length <= keptArea * HOLE_FILL_MAX_SHARE) {
      for (const p of hole) alpha[p] = 255;
    }
  }

  return alpha;
}

/**
 * Checks the cut-out for an empty or missing item, kept background, erased
 * parts and faded areas, then crops away fully transparent margins.
 */
async function verifyAndTrim(
  pixels: ImageData,
  itemBox: Rect | undefined,
  thinItem: boolean
): Promise<{ blob: Blob; transparentRatio: number; quality: IsolationResult["quality"]; issue?: string }> {
  const { width, height, data } = pixels;

  // Item box with a small tolerance, and the photo's outer edge band
  const tol = itemBox ? Math.max(itemBox.w, itemBox.h) * 0.03 : 0;
  const bx0 = itemBox ? itemBox.x - tol : 0;
  const by0 = itemBox ? itemBox.y - tol : 0;
  const bx1 = itemBox ? itemBox.x + itemBox.w + tol : width;
  const by1 = itemBox ? itemBox.y + itemBox.h + tol : height;
  const edge = Math.max(2, Math.round(Math.min(width, height) * 0.03));

  let transparent = 0, partial = 0;
  let outside = 0, outsideKept = 0, edgePx = 0, edgeKept = 0, inBoxKept = 0;
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
        continue;
      }
      if (alpha <= OPAQUE_ALPHA) partial++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (inBox) {
        inBoxKept++;
        if (x < inMinX) inMinX = x;
        if (x > inMaxX) inMaxX = x;
        if (y < inMinY) inMinY = y;
        if (y > inMaxY) inMaxY = y;
      }
    }
  }

  const total = width * height;
  const keptCount = total - transparent;
  const transparentRatio = transparent / total;

  if (maxX < 0 || keptCount / total < 0.002) {
    throw new BackgroundRemovalError("Background removal could not find the item in this photo.");
  }
  if (transparentRatio < 0.02) {
    throw new BackgroundRemovalError("Background removal could not separate the item from its background.");
  }

  let issue: string | undefined;
  const boxArea = itemBox ? itemBox.w * itemBox.h : 0;
  if (itemBox && boxArea > 0 && inBoxKept / boxArea < (thinItem ? MIN_BOX_COVERAGE_THIN : MIN_BOX_COVERAGE)) {
    issue = "Most of the item was removed with the background.";
  } else if (itemBox && outside > 0 && outsideKept / outside > MAX_OUTSIDE_KEPT) {
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
  } else if (partial / keptCount > MAX_PARTIAL_SHARE) {
    issue = "The item came out faded or see-through.";
  }

  // Crop to the item with a small margin
  const full = makeCanvas(width, height);
  full.ctx.putImageData(pixels, 0, 0);
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.02);
  const cropX = Math.max(0, minX - pad);
  const cropY = Math.max(0, minY - pad);
  const cropW = Math.min(width, maxX + pad + 1) - cropX;
  const cropH = Math.min(height, maxY + pad + 1) - cropY;
  const out = makeCanvas(cropW, cropH);
  out.ctx.drawImage(full.canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  const blob = await new Promise<Blob | null>((r) => out.canvas.toBlob(r, "image/png"));
  if (!blob) throw new BackgroundRemovalError("Background removal failed: could not encode PNG.");
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
