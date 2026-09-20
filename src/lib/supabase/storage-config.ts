/**
 * Must match `storage.buckets.id` and website `lib/supabase/storage-config.ts`.
 * Set `VITE_SUPABASE_STORAGE_BUCKET_ID` if your bucket id differs from the migration default.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sanitizeReviewStorageName,
  type ValidatedReviewFile,
} from "@/lib/review-upload-rules";

export function getEcommerceStorageBucketId(): string {
  return import.meta.env.VITE_SUPABASE_STORAGE_BUCKET_ID ?? "e-commerce-store";
}

export const REVIEW_MEDIA_FOLDER = "reviews" as const;

export type ReviewMediaStoredItem = {
  url: string;
  kind: "image" | "video";
};

export function buildReviewMediaObjectPath(reviewId: string, safeFileName: string): string {
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${REVIEW_MEDIA_FOLDER}/${reviewId}/${unique}_${safeFileName}`;
}

export async function uploadReviewMediaForReviewRow(
  supabase: SupabaseClient,
  reviewId: string,
  files: ValidatedReviewFile[],
): Promise<
  { ok: true; media: ReviewMediaStoredItem[] } | { ok: false; message: string; fileName?: string }
> {
  if (files.length === 0) {
    return { ok: true, media: [] };
  }

  const bucket = getEcommerceStorageBucketId();
  const media: ReviewMediaStoredItem[] = [];

  for (const { file, kind } of files) {
    const safe = sanitizeReviewStorageName(file.name);
    const path = buildReviewMediaObjectPath(reviewId, safe);

    const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: "31536000",
      upsert: false,
      contentType: file.type || undefined,
    });

    if (upErr) {
      return { ok: false, message: upErr.message, fileName: file.name };
    }

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    const url = pub.publicUrl;
    if (!url) {
      return { ok: false, message: "Could not resolve public URL for uploaded file.", fileName: file.name };
    }

    media.push({ url, kind });
  }

  return { ok: true, media };
}

/** Collect `url` fields from `reviews.media` JSON. */
export function extractUrlsFromReviewMediaJson(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const urls: string[] = [];
  for (const item of raw) {
    if (item && typeof item === "object" && typeof (item as { url?: unknown }).url === "string") {
      const u = (item as { url: string }).url.trim();
      if (u) urls.push(u);
    }
  }
  return urls;
}

/**
 * Derive Storage object paths from public URLs for this bucket.
 * Skips URLs that are not under `/object/public/{bucketId}/` (external or other buckets).
 */
export function publicMediaUrlsToObjectPaths(urls: string[], bucketId: string): string[] {
  const needle = `/object/public/${bucketId}/`;
  const paths: string[] = [];
  for (const raw of urls) {
    const s = raw.trim();
    if (!s) continue;
    try {
      const u = new URL(s);
      const i = u.pathname.indexOf(needle);
      if (i === -1) continue;
      const p = decodeURIComponent(u.pathname.slice(i + needle.length));
      if (p) paths.push(p);
    } catch {
      const i = s.indexOf(needle);
      if (i === -1) continue;
      const rest = s.slice(i + needle.length).split(/[?#]/)[0] ?? "";
      const p = decodeURIComponent(rest);
      if (p) paths.push(p);
    }
  }
  return [...new Set(paths)];
}

/**
 * Keep only object keys under this review’s folder (`reviews/{reviewId}/...`).
 * Prevents deleting unrelated bucket objects if `media` JSON ever pointed elsewhere.
 */
export function filterStoragePathsForReview(paths: string[], reviewId: string): string[] {
  const prefix = `${REVIEW_MEDIA_FOLDER}/${reviewId}/`;
  return paths.filter((p) => p.startsWith(prefix));
}

/**
 * Remove review media objects from Storage for **this review id only**
 * (paths must live under `reviews/{reviewId}/`).
 * Call before deleting the `reviews` row.
 */
export async function removeReviewMediaObjectsFromStorage(
  supabase: SupabaseClient,
  reviewId: string,
  mediaJson: unknown,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const bucket = getEcommerceStorageBucketId();
  const urls = extractUrlsFromReviewMediaJson(mediaJson);
  const paths = publicMediaUrlsToObjectPaths(urls, bucket);
  const safePaths = filterStoragePathsForReview(paths, reviewId);
  if (safePaths.length === 0) {
    return { ok: true };
  }
  const { error } = await supabase.storage.from(bucket).remove(safePaths);
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true };
}
