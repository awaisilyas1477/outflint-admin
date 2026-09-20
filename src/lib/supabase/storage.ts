import { supabase } from "@/lib/supabase/client";

import { ADMIN_MSG_CATALOG_UNAVAILABLE } from "@/lib/admin-user-messages";
/** Store media bucket used by the storefront (see storefront storage setup). */
export const ECOMMERCE_STORAGE_BUCKET = "e-commerce-store";

const COLLECTION_HERO_PREFIX = "collections/hero";
const HOME_HERO_PREFIX = "marketing/home-hero";
const PRODUCT_MEDIA_PREFIX = "products/media";
const COLOR_SWATCH_PREFIX = "colors/swatches";
const FAVICON_PREFIX = "branding/favicons";
const SEO_OG_PREFIX = "seo/og";
const SEO_LOGO_PREFIX = "seo/logo";

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const VIDEO_MAX_BYTES = 80 * 1024 * 1024;

const ALLOWED_IMAGE = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

function extFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    default:
      return "bin";
  }
}

function extFromFileName(name: string): string | null {
  const p = name.split(".").pop();
  if (p && /^[a-z0-9]+$/i.test(p)) return p.toLowerCase().slice(0, 8);
  return null;
}

/**
 * Upload a collection hero image; returns the public URL for `collections.hero_image`.
 */
export async function uploadCollectionHeroImage(
  file: File,
): Promise<{ publicUrl: string } | { error: string }> {
  if (!supabase) {
    return { error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }
  if (!ALLOWED_IMAGE.has(file.type)) {
    return { error: "Use a JPEG, PNG, WebP, GIF, or SVG image." };
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return { error: "Image must be 5 MB or smaller." };
  }

  const ext = extFromFileName(file.name) ?? extFromMime(file.type);
  const path = `${COLLECTION_HERO_PREFIX}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(ECOMMERCE_STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

  if (upErr) {
    return { error: upErr.message };
  }

  const { data } = supabase.storage.from(ECOMMERCE_STORAGE_BUCKET).getPublicUrl(path);
  return { publicUrl: data.publicUrl };
}

/**
 * Upload a homepage hero slide image; returns the public URL for `home_hero_slides.image_url`.
 */
export async function uploadHomeHeroImage(
  file: File,
): Promise<{ publicUrl: string } | { error: string }> {
  if (!supabase) {
    return { error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }
  if (!ALLOWED_IMAGE.has(file.type)) {
    return { error: "Use a JPEG, PNG, WebP, GIF, or SVG image." };
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return { error: "Image must be 5 MB or smaller." };
  }

  const ext = extFromFileName(file.name) ?? extFromMime(file.type);
  const path = `${HOME_HERO_PREFIX}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(ECOMMERCE_STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

  if (upErr) {
    return { error: upErr.message };
  }

  const { data } = supabase.storage.from(ECOMMERCE_STORAGE_BUCKET).getPublicUrl(path);
  return { publicUrl: data.publicUrl };
}

/**
 * Upload a product gallery image or video; returns public URL and kind.
 */
export async function uploadProductMedia(
  file: File,
): Promise<{ publicUrl: string; kind: "image" | "video" } | { error: string }> {
  if (!supabase) {
    return { error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }
  const isVideo = file.type.startsWith("video/");
  const isImage = ALLOWED_IMAGE.has(file.type);
  if (!isVideo && !isImage) {
    return { error: "Use an image (JPEG, PNG, WebP, GIF, SVG) or video (MP4, WebM, MOV)." };
  }
  const max = isVideo ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
  if (file.size > max) {
    return {
      error: isVideo ? "Video must be 80 MB or smaller." : "Image must be 5 MB or smaller.",
    };
  }
  const kind: "image" | "video" = isVideo ? "video" : "image";
  const ext = extFromFileName(file.name) ?? extFromMime(file.type);
  const path = `${PRODUCT_MEDIA_PREFIX}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(ECOMMERCE_STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || (kind === "video" ? "video/mp4" : "image/jpeg"),
    });

  if (upErr) {
    return { error: upErr.message };
  }

  const { data } = supabase.storage.from(ECOMMERCE_STORAGE_BUCKET).getPublicUrl(path);
  return { publicUrl: data.publicUrl, kind };
}

const SWATCH_MAX_BYTES = 2 * 1024 * 1024;

/** Small square image for color swatches (patterns / textures). */
export async function uploadColorSwatch(
  file: File,
): Promise<{ publicUrl: string } | { error: string }> {
  if (!supabase) {
    return { error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }
  if (!ALLOWED_IMAGE.has(file.type)) {
    return { error: "Use a JPEG, PNG, WebP, GIF, or SVG for the swatch image." };
  }
  if (file.size > SWATCH_MAX_BYTES) {
    return { error: "Swatch image must be 2 MB or smaller." };
  }
  const ext = extFromFileName(file.name) ?? extFromMime(file.type);
  const path = `${COLOR_SWATCH_PREFIX}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(ECOMMERCE_STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
  if (upErr) {
    return { error: upErr.message };
  }
  const { data } = supabase.storage.from(ECOMMERCE_STORAGE_BUCKET).getPublicUrl(path);
  return { publicUrl: data.publicUrl };
}

const FAVICON_MAX_BYTES = 1024 * 1024;

/**
 * Upload an Open Graph image (≥ 1200x630 recommended). Used for the global
 * default OG image and per-page OG overrides via `seo_meta.og_image_url`.
 */
export async function uploadSeoOgImage(
  file: File,
): Promise<{ publicUrl: string } | { error: string }> {
  if (!supabase) {
    return { error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }
  if (!ALLOWED_IMAGE.has(file.type)) {
    return { error: "Use a JPEG, PNG, WebP, GIF, or SVG image." };
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return { error: "Image must be 5 MB or smaller." };
  }
  const ext = extFromFileName(file.name) ?? extFromMime(file.type);
  const path = `${SEO_OG_PREFIX}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(ECOMMERCE_STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
  if (upErr) return { error: upErr.message };
  const { data } = supabase.storage.from(ECOMMERCE_STORAGE_BUCKET).getPublicUrl(path);
  return { publicUrl: data.publicUrl };
}

/** Upload an Organization logo (square preferred). Stored alongside SEO assets. */
export async function uploadSeoLogo(
  file: File,
): Promise<{ publicUrl: string } | { error: string }> {
  if (!supabase) {
    return { error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }
  if (!ALLOWED_IMAGE.has(file.type)) {
    return { error: "Use a JPEG, PNG, WebP, GIF, or SVG image." };
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return { error: "Image must be 5 MB or smaller." };
  }
  const ext = extFromFileName(file.name) ?? extFromMime(file.type);
  const path = `${SEO_LOGO_PREFIX}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(ECOMMERCE_STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
  if (upErr) return { error: upErr.message };
  const { data } = supabase.storage.from(ECOMMERCE_STORAGE_BUCKET).getPublicUrl(path);
  return { publicUrl: data.publicUrl };
}

/** Upload favicon image to the public e-commerce bucket for metadata/icons usage. */
export async function uploadFaviconImage(
  file: File,
): Promise<{ publicUrl: string } | { error: string }> {
  if (!supabase) {
    return { error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }
  if (!ALLOWED_IMAGE.has(file.type)) {
    return { error: "Use a PNG, SVG, JPG, WebP, or GIF image for favicon." };
  }
  if (file.size > FAVICON_MAX_BYTES) {
    return { error: "Favicon image must be 1 MB or smaller." };
  }
  const ext = extFromFileName(file.name) ?? extFromMime(file.type);
  const path = `${FAVICON_PREFIX}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(ECOMMERCE_STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
  if (upErr) {
    return { error: upErr.message };
  }
  const { data } = supabase.storage.from(ECOMMERCE_STORAGE_BUCKET).getPublicUrl(path);
  return { publicUrl: data.publicUrl };
}
