import { supabase } from "@/lib/supabase/client";
import { removeReviewMediaObjectsFromStorage } from "@/lib/supabase/storage-config";

export type ReviewModerationStatus = "pending" | "approved" | "rejected";

export type ReviewAdminRow = {
  id: string;
  product_id: string;
  user_id: string | null;
  attributed_display_name?: string | null;
  attributed_display_email?: string | null;
  rating: number;
  title: string;
  body: string;
  status: ReviewModerationStatus;
  created_at: string;
  updated_at: string;
  /** JSON array of storefront-uploaded media (see migration). */
  media?: unknown;
  product_name?: string | null;
  /** Registered user name, or synthetic display name (+ optional email) from the review row. */
  reviewer_label?: string | null;
};

export type ProductPicklistRow = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
};

/** Parse `reviews.media` JSON for admin UI (same shape as storefront PDP). */
export function parseReviewMediaItems(raw: unknown): { url: string; kind: "image" | "video" }[] {
  if (!Array.isArray(raw)) return [];
  const out: { url: string; kind: "image" | "video" }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const url = typeof o.url === "string" ? o.url : "";
    const kind = o.kind === "video" ? "video" : "image";
    if (url) out.push({ url, kind });
  }
  return out;
}

function logReviews(op: string, message: string | undefined) {
  if (!message) return;
  console.error(`[reviews-admin] ${op}`, message);
}

type UsersJoinRow = { first_name?: string; last_name?: string };

function reviewerLabelFromReviewRow(
  userId: string | null | undefined,
  attributedName: string | null | undefined,
  attributedEmail: string | null | undefined,
  users: UsersJoinRow | UsersJoinRow[] | undefined,
): string | null {
  const attr = attributedName?.trim();
  if (attr) {
    const em = attributedEmail?.trim();
    return em ? `${attr} (${em})` : attr;
  }
  if (!userId) return null;
  const u = Array.isArray(users) ? users[0] : users;
  return [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim() || null;
}

export async function fetchReviewsAdmin(options?: {
  status?: ReviewModerationStatus | "all";
  limit?: number;
  offset?: number;
  /** If non-empty, only rows whose `rating` is in this set (typically 1–5 star levels). */
  ratings?: number[];
}): Promise<ReviewAdminRow[]> {
  if (!supabase) return [];
  const limit = Math.min(options?.limit ?? 100, 500);
  const offset = Math.max(options?.offset ?? 0, 0);
  let q = supabase
    .from("reviews")
    .select(
      "id, product_id, user_id, attributed_display_name, attributed_display_email, rating, title, body, status, media, created_at, updated_at, users ( first_name, last_name )",
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (options?.status && options.status !== "all") {
    q = q.eq("status", options.status);
  }
  const ratings = options?.ratings?.filter((n) => n >= 1 && n <= 5) ?? [];
  if (ratings.length > 0) {
    q = q.in("rating", ratings);
  }
  const { data, error } = await q;
  if (error) {
    logReviews("fetchReviewsAdmin", error.message);
    return [];
  }
  const rows = (data ?? []) as ReviewAdminRow[];
  const pids = [...new Set(rows.map((r) => r.product_id))];
  if (pids.length === 0) return rows;
  const { data: prows, error: pErr } = await supabase
    .from("products")
    .select("id, name")
    .in("id", pids);
  if (pErr) {
    logReviews("fetchReviewsAdmin products", pErr.message);
    return rows;
  }
  const nameById = new Map((prows ?? []).map((p) => [(p as { id: string }).id, (p as { name: string }).name]));
  return rows.map((r) => {
    const raw = r as ReviewAdminRow & {
      users?: { first_name?: string; last_name?: string } | { first_name?: string; last_name?: string }[];
    };
    const reviewer_label = reviewerLabelFromReviewRow(
      r.user_id,
      raw.attributed_display_name,
      raw.attributed_display_email,
      raw.users,
    );
    return {
      ...r,
      product_name: nameById.get(r.product_id) ?? null,
      reviewer_label,
    };
  });
}

export async function countReviewsAdmin(options?: {
  status?: ReviewModerationStatus | "all";
  ratings?: number[];
}): Promise<number> {
  if (!supabase) return 0;
  let q = supabase.from("reviews").select("id", { count: "exact", head: true });
  if (options?.status && options.status !== "all") {
    q = q.eq("status", options.status);
  }
  const ratings = options?.ratings?.filter((n) => n >= 1 && n <= 5) ?? [];
  if (ratings.length > 0) {
    q = q.in("rating", ratings);
  }
  const { count, error } = await q;
  if (error) {
    logReviews("countReviewsAdmin", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function countReviewsByStatusAdmin(): Promise<
  Record<ReviewModerationStatus | "all", number>
> {
  const empty: Record<ReviewModerationStatus | "all", number> = {
    all: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  };
  if (!supabase) return { ...empty };
  const statuses: ReviewModerationStatus[] = ["pending", "approved", "rejected"];
  const results = await Promise.all(
    statuses.map((status) =>
      supabase!
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("status", status)
        .then((r) => ({ status, count: r.error ? 0 : (r.count ?? 0) })),
    ),
  );
  const out: Record<ReviewModerationStatus | "all", number> = { ...empty };
  for (const r of results) {
    out[r.status] = r.count;
    out.all += r.count;
  }
  return out;
}

export async function fetchReviewsByUserIdAdmin(
  userId: string,
  limit = 80,
): Promise<ReviewAdminRow[]> {
  if (!supabase) return [];
  const cap = Math.min(limit, 200);
  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id, product_id, user_id, attributed_display_name, attributed_display_email, rating, title, body, status, media, created_at, updated_at, users ( first_name, last_name )",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(cap);
  if (error) {
    logReviews("fetchReviewsByUserIdAdmin", error.message);
    return [];
  }
  const rows = (data ?? []) as ReviewAdminRow[];
  const pids = [...new Set(rows.map((r) => r.product_id))];
  if (pids.length === 0) return rows;
  const { data: prows, error: pErr } = await supabase
    .from("products")
    .select("id, name")
    .in("id", pids);
  if (pErr) {
    logReviews("fetchReviewsByUserIdAdmin products", pErr.message);
    return rows;
  }
  const nameById = new Map((prows ?? []).map((p) => [(p as { id: string }).id, (p as { name: string }).name]));
  return rows.map((r) => {
    const raw = r as ReviewAdminRow & {
      users?: { first_name?: string; last_name?: string } | { first_name?: string; last_name?: string }[];
    };
    const reviewer_label = reviewerLabelFromReviewRow(
      r.user_id,
      raw.attributed_display_name,
      raw.attributed_display_email,
      raw.users,
    );
    return {
      ...r,
      product_name: nameById.get(r.product_id) ?? null,
      reviewer_label,
    };
  });
}

/** Lightweight product list for composing admin reviews. */
export async function fetchProductPicklistAdmin(limit = 600): Promise<ProductPicklistRow[]> {
  if (!supabase) return [];
  const cap = Math.min(limit, 1000);
  const { data, error } = await supabase
    .from("products")
    .select("id, name, slug, status")
    .order("name", { ascending: true })
    .limit(cap);
  if (error) {
    logReviews("fetchProductPicklistAdmin", error.message);
    return [];
  }
  return (data ?? []) as ProductPicklistRow[];
}

/** Slug → product id for CSV import (active + draft so admin can seed before publish). */
export async function fetchProductSlugIdMapAdmin(limit = 3000): Promise<Map<string, string>> {
  if (!supabase) return new Map();
  const cap = Math.min(limit, 5000);
  const { data, error } = await supabase
    .from("products")
    .select("id, slug")
    .order("name", { ascending: true })
    .limit(cap);
  if (error) {
    logReviews("fetchProductSlugIdMapAdmin", error.message);
    return new Map();
  }
  const m = new Map<string, string>();
  for (const row of data ?? []) {
    const r = row as { id: string; slug: string | null };
    const s = (r.slug ?? "").trim().toLowerCase();
    if (s) m.set(s, r.id);
  }
  return m;
}

export async function deleteReviewAdmin(reviewId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };

  const { data: row, error: fetchErr } = await supabase
    .from("reviews")
    .select("media")
    .eq("id", reviewId)
    .maybeSingle();

  if (fetchErr) {
    logReviews("deleteReviewAdmin fetch", fetchErr.message);
    return { ok: false, error: fetchErr.message };
  }

  const rm = await removeReviewMediaObjectsFromStorage(supabase, reviewId, row?.media);
  if (!rm.ok) {
    logReviews("deleteReviewAdmin storage", rm.message);
    return {
      ok: false,
      error: `Could not remove review files from storage: ${rm.message}`,
    };
  }

  const { error } = await supabase.from("reviews").delete().eq("id", reviewId);
  if (error) {
    logReviews("deleteReviewAdmin", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export type ReviewMediaDbItem = { url: string; kind: "image" | "video" };

export type CreateReviewAsAdminInput =
  | {
      product_id: string;
      user_id: string;
      rating: number;
      title: string;
      body: string;
      status: ReviewModerationStatus;
      /** Optional public URLs (same shape as storefront `reviews.media`). */
      media?: ReviewMediaDbItem[] | null;
    }
  | {
      product_id: string;
      attributed_display_name: string;
      attributed_display_email?: string | null;
      rating: number;
      title: string;
      body: string;
      status: ReviewModerationStatus;
      media?: ReviewMediaDbItem[] | null;
    };

export type CreateReviewAsAdminResult =
  | { ok: true; reviewId: string }
  | { ok: false; error?: string };

function normalizeInsertMedia(raw: ReviewMediaDbItem[] | null | undefined): unknown {
  const list = Array.isArray(raw) ? raw : [];
  const out: { url: string; kind: "image" | "video" }[] = [];
  for (const item of list) {
    const url = typeof item?.url === "string" ? item.url.trim() : "";
    if (!url) continue;
    const kind = item.kind === "video" ? "video" : "image";
    out.push({ url, kind });
    if (out.length >= 6) break;
  }
  return out;
}

export async function createReviewAsAdmin(
  input: CreateReviewAsAdminInput,
): Promise<CreateReviewAsAdminResult> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };

  if ("user_id" in input) {
    const { data: userRow } = await supabase
      .from("users")
      .select("first_name, last_name")
      .eq("id", input.user_id)
      .maybeSingle();
    const reviewerName = userRow
      ? [userRow.first_name, userRow.last_name].filter(Boolean).join(" ").trim()
      : "";
    const { data, error } = await supabase
      .from("reviews")
      .insert({
        product_id: input.product_id,
        user_id: input.user_id,
        rating: input.rating,
        title: input.title.trim(),
        body: input.body.trim(),
        status: input.status,
        media: normalizeInsertMedia(input.media) as unknown,
        attributed_display_name: reviewerName || null,
        attributed_display_email: null,
      })
      .select("id")
      .single();
    if (error) {
      logReviews("createReviewAsAdmin", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true, reviewId: (data as { id: string }).id };
  }

  const name = input.attributed_display_name.trim();
  if (!name) {
    return { ok: false, error: "Display name is required for display-only reviews." };
  }
  const email = input.attributed_display_email?.trim() || null;
  const { data, error } = await supabase
    .from("reviews")
    .insert({
      product_id: input.product_id,
      user_id: null,
      rating: input.rating,
      title: input.title.trim(),
      body: input.body.trim(),
      status: input.status,
      media: normalizeInsertMedia(input.media) as unknown,
      attributed_display_name: name,
      attributed_display_email: email,
    })
    .select("id")
    .single();
  if (error) {
    logReviews("createReviewAsAdmin", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, reviewId: (data as { id: string }).id };
}

export async function updateReviewStatusAdmin(
  reviewId: string,
  status: ReviewModerationStatus,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("reviews")
    .update({ status, updated_at: now })
    .eq("id", reviewId);
  if (error) {
    logReviews("updateReviewStatusAdmin", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
