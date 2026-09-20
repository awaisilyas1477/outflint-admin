import { supabase } from "@/lib/supabase/client";

export type WishlistRowKind = "variant" | "option_snapshot";

export type WishlistAdminRow = {
  id: string;
  user_id: string;
  product_id: string;
  product_variant_id: string | null;
  requested_option_values: Record<string, unknown> | null;
  option_request_fingerprint: string | null;
  notify_on_restock: boolean;
  restock_notified_at: string | null;
  created_at: string;
  kind: WishlistRowKind;
  product_name: string | null;
  product_slug: string | null;
  variant_sku: string | null;
  variant_option_values: Record<string, unknown> | null;
  user_first_name: string | null;
  user_last_name: string | null;
};

export type WishlistOverviewStats = {
  totalRows: number;
  variantRows: number;
  optionSnapshotRows: number;
  notifyOnRestockRows: number;
  pendingRestockQueue: number;
};

export type RestockQueueAdminRow = {
  id: string;
  user_email: string;
  user_id: string;
  product_variant_id: string;
  wishlist_item_id: string;
  processed_at: string | null;
  created_at: string;
  variant_sku: string | null;
  product_name: string | null;
};

export type WishlistProductRank = {
  product_id: string;
  product_name: string | null;
  save_count: number;
  snapshot_count: number;
  variant_row_count: number;
};

function logWishlist(op: string, message: string | undefined) {
  if (!message) return;
  console.error(`[wishlist-admin] ${op}`, message);
}

function rowKind(r: { product_variant_id: string | null }): WishlistRowKind {
  return r.product_variant_id ? "variant" : "option_snapshot";
}

/** PostgREST may return embedded many-to-one rows as object or single-element array. */
function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export async function fetchWishlistOverviewStats(): Promise<WishlistOverviewStats> {
  if (!supabase) {
    return {
      totalRows: 0,
      variantRows: 0,
      optionSnapshotRows: 0,
      notifyOnRestockRows: 0,
      pendingRestockQueue: 0,
    };
  }

  const [
    total,
    variants,
    snapshots,
    notify,
    queuePending,
  ] = await Promise.all([
    supabase.from("wishlist_items").select("id", { count: "exact", head: true }),
    supabase
      .from("wishlist_items")
      .select("id", { count: "exact", head: true })
      .not("product_variant_id", "is", null),
    supabase.from("wishlist_items").select("id", { count: "exact", head: true }).is("product_variant_id", null),
    supabase
      .from("wishlist_items")
      .select("id", { count: "exact", head: true })
      .eq("notify_on_restock", true),
    supabase
      .from("restock_notification_queue")
      .select("id", { count: "exact", head: true })
      .is("processed_at", null),
  ]);

  if (total.error) logWishlist("count total", total.error.message);
  if (variants.error) logWishlist("count variants", variants.error.message);
  if (snapshots.error) logWishlist("count snapshots", snapshots.error.message);
  if (notify.error) logWishlist("count notify", notify.error.message);
  if (queuePending.error) logWishlist("count queue", queuePending.error.message);

  return {
    totalRows: total.count ?? 0,
    variantRows: variants.count ?? 0,
    optionSnapshotRows: snapshots.count ?? 0,
    notifyOnRestockRows: notify.count ?? 0,
    pendingRestockQueue: queuePending.error ? 0 : queuePending.count ?? 0,
  };
}

export async function fetchWishlistRowsAdmin(options: {
  kind?: "all" | "variant" | "snapshot";
  limit?: number;
  offset?: number;
}): Promise<{ rows: WishlistAdminRow[]; total: number }> {
  if (!supabase) return { rows: [], total: 0 };
  const limit = Math.min(options.limit ?? 80, 200);
  const offset = options.offset ?? 0;

  let q = supabase
    .from("wishlist_items")
    .select(
      `
      id,
      user_id,
      product_id,
      product_variant_id,
      requested_option_values,
      option_request_fingerprint,
      notify_on_restock,
      restock_notified_at,
      created_at,
      users (first_name, last_name),
      products (name, slug),
      product_variants (sku, option_values)
    `,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options.kind === "variant") {
    q = q.not("product_variant_id", "is", null);
  } else if (options.kind === "snapshot") {
    q = q.is("product_variant_id", null);
  }

  const { data, error, count } = await q;
  if (error) {
    logWishlist("fetchWishlistRowsAdmin", error.message);
    return { rows: [], total: 0 };
  }

  const rows: WishlistAdminRow[] = (data ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    const users = embedOne(
      r.users as { first_name: string | null; last_name: string | null } | null,
    );
    const products = embedOne(r.products as { name: string | null; slug: string | null } | null);
    const product_variants = embedOne(
      r.product_variants as {
        sku: string | null;
        option_values: Record<string, unknown> | null;
      } | null,
    );
    const base = {
      id: r.id as string,
      user_id: r.user_id as string,
      product_id: r.product_id as string,
      product_variant_id: (r.product_variant_id as string | null) ?? null,
      requested_option_values: (r.requested_option_values as Record<string, unknown> | null) ?? null,
      option_request_fingerprint: (r.option_request_fingerprint as string | null) ?? null,
      notify_on_restock: r.notify_on_restock as boolean,
      restock_notified_at: (r.restock_notified_at as string | null) ?? null,
      created_at: r.created_at as string,
    };
    return {
      ...base,
      kind: rowKind(base),
      product_name: products?.name ?? null,
      product_slug: products?.slug ?? null,
      variant_sku: product_variants?.sku ?? null,
      variant_option_values: product_variants?.option_values ?? null,
      user_first_name: users?.first_name ?? null,
      user_last_name: users?.last_name ?? null,
    };
  });

  return { rows, total: count ?? rows.length };
}

export async function fetchWishlistByUserIdAdmin(
  userId: string,
  limit = 80,
): Promise<WishlistAdminRow[]> {
  if (!supabase) return [];
  const cap = Math.min(limit, 200);
  const { data, error } = await supabase
    .from("wishlist_items")
    .select(
      `
      id,
      user_id,
      product_id,
      product_variant_id,
      requested_option_values,
      option_request_fingerprint,
      notify_on_restock,
      restock_notified_at,
      created_at,
      users (first_name, last_name),
      products (name, slug),
      product_variants (sku, option_values)
    `,
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(cap);

  if (error) {
    logWishlist("fetchWishlistByUserIdAdmin", error.message);
    return [];
  }

  return (data ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    const users = embedOne(
      r.users as { first_name: string | null; last_name: string | null } | null,
    );
    const products = embedOne(r.products as { name: string | null; slug: string | null } | null);
    const product_variants = embedOne(
      r.product_variants as {
        sku: string | null;
        option_values: Record<string, unknown> | null;
      } | null,
    );
    const base = {
      id: r.id as string,
      user_id: r.user_id as string,
      product_id: r.product_id as string,
      product_variant_id: (r.product_variant_id as string | null) ?? null,
      requested_option_values: (r.requested_option_values as Record<string, unknown> | null) ?? null,
      option_request_fingerprint: (r.option_request_fingerprint as string | null) ?? null,
      notify_on_restock: r.notify_on_restock as boolean,
      restock_notified_at: (r.restock_notified_at as string | null) ?? null,
      created_at: r.created_at as string,
    };
    return {
      ...base,
      kind: rowKind(base),
      product_name: products?.name ?? null,
      product_slug: products?.slug ?? null,
      variant_sku: product_variants?.sku ?? null,
      variant_option_values: product_variants?.option_values ?? null,
      user_first_name: users?.first_name ?? null,
      user_last_name: users?.last_name ?? null,
    };
  });
}

export async function fetchRestockQueueAdmin(limit = 100): Promise<RestockQueueAdminRow[]> {
  if (!supabase) return [];
  const cap = Math.min(limit, 300);
  const { data, error } = await supabase
    .from("restock_notification_queue")
    .select(
      `
      id,
      user_email,
      user_id,
      product_variant_id,
      wishlist_item_id,
      processed_at,
      created_at,
      product_variants (
        sku,
        products (name)
      )
    `,
    )
    .order("created_at", { ascending: false })
    .limit(cap);

  if (error) {
    logWishlist("fetchRestockQueueAdmin", error.message);
    return [];
  }

  return (data ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    const pv = embedOne(
      r.product_variants as {
        sku: string | null;
        products: { name: string | null } | { name: string | null }[] | null;
      } | null,
    );
    const prod = pv ? embedOne(pv.products) : null;
    return {
      id: r.id as string,
      user_email: r.user_email as string,
      user_id: r.user_id as string,
      product_variant_id: r.product_variant_id as string,
      wishlist_item_id: r.wishlist_item_id as string,
      processed_at: (r.processed_at as string | null) ?? null,
      created_at: r.created_at as string,
      variant_sku: pv?.sku ?? null,
      product_name: prod?.name ?? null,
    };
  });
}

/** Aggregate wishlist saves per product (bounded scan for admin insight). */
export async function fetchTopWishlistedProductsAdmin(
  topN = 15,
  scanCap = 8000,
): Promise<WishlistProductRank[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("wishlist_items")
    .select("product_id, product_variant_id")
    .limit(Math.min(scanCap, 20_000));

  if (error) {
    logWishlist("fetchTopWishlistedProductsAdmin", error.message);
    return [];
  }

  const byProduct = new Map<
    string,
    { save_count: number; snapshot_count: number; variant_row_count: number }
  >();

  for (const row of data ?? []) {
    const pid = (row as { product_id: string }).product_id;
    const vid = (row as { product_variant_id: string | null }).product_variant_id;
    let agg = byProduct.get(pid);
    if (!agg) {
      agg = { save_count: 0, snapshot_count: 0, variant_row_count: 0 };
      byProduct.set(pid, agg);
    }
    agg.save_count += 1;
    if (vid === null) agg.snapshot_count += 1;
    else agg.variant_row_count += 1;
  }

  const sorted = [...byProduct.entries()]
    .sort((a, b) => b[1].save_count - a[1].save_count)
    .slice(0, topN);

  const ids = sorted.map(([id]) => id);
  if (ids.length === 0) return [];

  const { data: prows, error: pErr } = await supabase
    .from("products")
    .select("id, name")
    .in("id", ids);

  if (pErr) logWishlist("fetchTopWishlistedProductsAdmin products", pErr.message);
  const nameById = new Map((prows ?? []).map((p) => [(p as { id: string }).id, (p as { name: string }).name]));

  return sorted.map(([product_id, agg]) => ({
    product_id,
    product_name: nameById.get(product_id) ?? null,
    save_count: agg.save_count,
    snapshot_count: agg.snapshot_count,
    variant_row_count: agg.variant_row_count,
  }));
}
