/** Longest edge kept for stored originals; plenty for zooming on any screen */
const ORIGINAL_MAX_EDGE = 3200;
/** Originals smaller than this (and within the edge limit) are stored untouched */
const ORIGINAL_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Returns the photo to keep as the "original": unchanged when it is already a
 * sensible size, otherwise re-encoded once as a high-quality JPEG with the
 * same aspect ratio. Formats the browser can't decode (e.g. HEIC outside
 * Safari) are kept as they are.
 */
export async function prepareOriginalForStorage(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= ORIGINAL_MAX_EDGE && file.size <= ORIGINAL_MAX_BYTES) {
    bitmap.close();
    return file;
  }

  const scale = Math.min(1, ORIGINAL_MAX_EDGE / longest);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.fillStyle = "#ffffff"; // JPEG has no transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
  if (!blob) return file;
  const base = file.name.replace(/\.[^/.]+$/, "") || "original";
  return new File([blob], `${base}-original.jpg`, { type: "image/jpeg" });
}
