/** Pull the first usable image URL from `products.images` jsonb (string[] or legacy shapes). */

export function firstProductImageUrl(images: unknown): string {
  if (!Array.isArray(images) || images.length === 0) return "";
  for (const entry of images) {
    if (typeof entry === "string" && entry.trim()) return entry.trim();
    if (entry && typeof entry === "object") {
      const url = (entry as { url?: unknown }).url;
      if (typeof url === "string" && url.trim()) return url.trim();
    }
  }
  return "";
}

/** Prefer order snapshot; fall back to live catalog images. */
export function resolveOrderLineImageUrl(
  snapshot: string | null | undefined,
  productImages: unknown,
): string {
  const snap = typeof snapshot === "string" ? snapshot.trim() : "";
  if (snap) return snap;
  return firstProductImageUrl(productImages);
}
