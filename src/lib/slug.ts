import slugify from "slugify";

/**
 * URL-safe slug for storefront paths (products, collections, etc.).
 * Always derive from a human-readable label — do not ask users to edit slugs.
 */
export function slugFromLabel(label: string): string {
  const s = label.trim();
  if (!s) return "";
  return slugify(s, { lower: true, strict: true, trim: true });
}
