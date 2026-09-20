import { supabase } from "@/lib/supabase/client";

export type LowStockRow = {
  variant_id: string;
  sku: string;
  product_id: string;
  product_name: string;
  quantity_on_hand: number;
};

const DEFAULT_THRESHOLD = 5;

export async function fetchLowStockVariantsAdmin(
  threshold = DEFAULT_THRESHOLD,
  limit = 20,
): Promise<LowStockRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("inventory")
    .select(
      "quantity_on_hand, product_variant_id, product_variants!inner(id, sku, product_id, products!inner(id, name, status))",
    )
    .lte("quantity_on_hand", threshold)
    .order("quantity_on_hand", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[inventory-admin] fetchLowStock", error.message);
    return [];
  }
  const rows: LowStockRow[] = [];
  for (const row of data ?? []) {
    const pv = row.product_variants as unknown as {
      id: string;
      sku: string;
      product_id: string;
      products: { id: string; name: string; status: string };
    } | null;
    if (!pv || pv.products?.status !== "active") continue;
    rows.push({
      variant_id: pv.id,
      sku: pv.sku,
      product_id: pv.product_id,
      product_name: pv.products.name,
      quantity_on_hand: (row as { quantity_on_hand: number }).quantity_on_hand,
    });
  }
  return rows;
}

export async function countLowStockVariantsAdmin(threshold = DEFAULT_THRESHOLD): Promise<number> {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("inventory")
    .select("product_variant_id", { count: "exact", head: true })
    .lte("quantity_on_hand", threshold);
  if (error) {
    console.error("[inventory-admin] countLowStock", error.message);
    return 0;
  }
  return count ?? 0;
}
