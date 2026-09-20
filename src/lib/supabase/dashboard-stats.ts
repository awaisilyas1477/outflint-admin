import { supabase } from "@/lib/supabase/client";

export type DashboardStats = {
  activeProductCount: number | null;
  variantSkuCount: number | null;
  collectionCount: number | null;
  openOrderCount: number | null;
  pendingReviewCount: number | null;
  wishlistSaveCount: number | null;
  restockQueuePendingCount: number | null;
};

const OPEN_STATUSES = [
  "pending",
  "confirmed",
  "paid",
  "processing",
] as const;

function logStats(op: string, message: string | undefined) {
  if (!message) return;
  console.error(`[dashboard-stats] ${op}`, message);
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  if (!supabase) {
    return {
      activeProductCount: null,
      variantSkuCount: null,
      collectionCount: null,
      openOrderCount: null,
      pendingReviewCount: null,
      wishlistSaveCount: null,
      restockQueuePendingCount: null,
    };
  }

  const [
    activeProducts,
    variants,
    collections,
    openOrders,
    pendingReviews,
    wishlistSaves,
    restockQueuePending,
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase.from("product_variants").select("id", { count: "exact", head: true }),
    supabase.from("collections").select("id", { count: "exact", head: true }),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", [...OPEN_STATUSES]),
    supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase.from("wishlist_items").select("id", { count: "exact", head: true }),
    supabase
      .from("restock_notification_queue")
      .select("id", { count: "exact", head: true })
      .is("processed_at", null),
  ]);

  if (activeProducts.error)
    logStats("products count", activeProducts.error.message);
  if (variants.error) logStats("variants count", variants.error.message);
  if (collections.error)
    logStats("collections count", collections.error.message);
  if (openOrders.error) logStats("orders count", openOrders.error.message);
  if (pendingReviews.error)
    logStats("reviews count", pendingReviews.error.message);
  if (wishlistSaves.error)
    logStats("wishlist count", wishlistSaves.error.message);
  if (restockQueuePending.error)
    logStats("restock queue count", restockQueuePending.error.message);

  return {
    activeProductCount: activeProducts.count ?? null,
    variantSkuCount: variants.count ?? null,
    collectionCount: collections.count ?? null,
    openOrderCount: openOrders.count ?? null,
    pendingReviewCount: pendingReviews.count ?? null,
    wishlistSaveCount: wishlistSaves.error ? null : wishlistSaves.count ?? null,
    restockQueuePendingCount: restockQueuePending.error
      ? null
      : restockQueuePending.count ?? null,
  };
}

export type RecentOrderLine = {
  id: string;
  order_number: string | null;
  email: string;
  total_cents: number;
  currency: string;
  status: string;
  created_at: string;
};

export async function fetchRecentOrdersForActivity(
  limit = 8,
): Promise<RecentOrderLine[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, email, total_cents, currency, status, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    logStats("fetchRecentOrdersForActivity", error.message);
    return [];
  }
  return (data ?? []) as RecentOrderLine[];
}

export type OrdersInRangeStats = {
  orderCount: number;
  revenueCents: number;
  avgOrderCents: number;
};

export async function fetchOrdersAggregatesSince(
  sinceIso: string,
): Promise<OrdersInRangeStats> {
  if (!supabase) {
    return { orderCount: 0, revenueCents: 0, avgOrderCents: 0 };
  }
  const { data, error } = await supabase
    .from("orders")
    .select("total_cents, status")
    .gte("created_at", sinceIso);
  if (error) {
    logStats("fetchOrdersAggregatesSince", error.message);
    return { orderCount: 0, revenueCents: 0, avgOrderCents: 0 };
  }
  const rows = (data ?? []).filter(
    (r) =>
      (r as { status: string }).status !== "cancelled" &&
      (r as { status: string }).status !== "refunded",
  ) as { total_cents: number }[];
  const orderCount = rows.length;
  const revenueCents = rows.reduce((s, r) => s + (r.total_cents ?? 0), 0);
  const avgOrderCents =
    orderCount > 0 ? Math.round(revenueCents / orderCount) : 0;
  return { orderCount, revenueCents, avgOrderCents };
}

export type DailyOrderPoint = {
  date: string;
  orders: number;
  revenueCents: number;
};

export async function fetchDailyOrderStats(days = 30): Promise<DailyOrderPoint[]> {
  if (!supabase) return [];
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from("orders")
    .select("created_at, total_cents, status")
    .gte("created_at", since.toISOString());
  if (error) {
    logStats("fetchDailyOrderStats", error.message);
    return [];
  }
  const map = new Map<string, { orders: number; revenueCents: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const key = d.toISOString().slice(0, 10);
    map.set(key, { orders: 0, revenueCents: 0 });
  }
  for (const row of data ?? []) {
    const r = row as { created_at: string; total_cents: number; status: string };
    if (r.status === "cancelled" || r.status === "refunded") continue;
    const key = r.created_at.slice(0, 10);
    const bucket = map.get(key);
    if (!bucket) continue;
    bucket.orders += 1;
    bucket.revenueCents += r.total_cents ?? 0;
  }
  return Array.from(map.entries()).map(([date, v]) => ({
    date,
    orders: v.orders,
    revenueCents: v.revenueCents,
  }));
}

export type StatusCount = { status: string; count: number };

export async function fetchOrderStatusCounts(): Promise<StatusCount[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("orders").select("status");
  if (error) {
    logStats("fetchOrderStatusCounts", error.message);
    return [];
  }
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    const s = (row as { status: string }).status;
    map.set(s, (map.get(s) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);
}

export type BestSellerRow = {
  product_name: string;
  sku: string;
  units_sold: number;
  revenue_cents: number;
};

export async function fetchBestSellers30d(limit = 10): Promise<BestSellerRow[]> {
  if (!supabase) return [];
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const { data: orders, error: oErr } = await supabase
    .from("orders")
    .select("id, status")
    .gte("created_at", since.toISOString());
  if (oErr || !orders?.length) {
    if (oErr) logStats("fetchBestSellers30d orders", oErr.message);
    return [];
  }
  const orderIds = orders
    .filter((o) => {
      const s = (o as { status: string }).status;
      return s !== "cancelled" && s !== "refunded";
    })
    .map((o) => (o as { id: string }).id);
  if (orderIds.length === 0) return [];
  const { data: items, error: iErr } = await supabase
    .from("order_items")
    .select("product_name_snapshot, sku_snapshot, quantity, line_subtotal_cents, order_id")
    .in("order_id", orderIds);
  if (iErr) {
    logStats("fetchBestSellers30d items", iErr.message);
    return [];
  }
  const map = new Map<string, BestSellerRow>();
  for (const row of items ?? []) {
    const r = row as {
      product_name_snapshot: string;
      sku_snapshot: string;
      quantity: number;
      line_subtotal_cents: number;
    };
    const key = r.sku_snapshot || r.product_name_snapshot;
    const cur = map.get(key) ?? {
      product_name: r.product_name_snapshot,
      sku: r.sku_snapshot,
      units_sold: 0,
      revenue_cents: 0,
    };
    cur.units_sold += r.quantity;
    cur.revenue_cents += r.line_subtotal_cents ?? 0;
    map.set(key, cur);
  }
  return Array.from(map.values())
    .sort((a, b) => b.units_sold - a.units_sold || b.revenue_cents - a.revenue_cents)
    .slice(0, limit);
}

export type ActionInboxCounts = {
  openOrders: number;
  lowStock: number;
  pendingReviews: number;
};

export async function fetchActionInboxCounts(): Promise<ActionInboxCounts> {
  const stats = await fetchDashboardStats();
  return {
    openOrders: stats.openOrderCount ?? 0,
    lowStock: 0,
    pendingReviews: stats.pendingReviewCount ?? 0,
  };
}
