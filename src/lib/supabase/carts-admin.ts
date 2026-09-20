import { supabase } from "@/lib/supabase/client";

export type AbandonedCartRow = {
  id: string;
  user_id: string;
  quantity: number;
  updated_at: string;
  customer_name: string;
  customer_phone: string;
  variant_sku: string;
  product_name: string;
  product_id: string;
  unit_price: number;
};

export async function fetchAbandonedCartsAdmin(limit = 200): Promise<AbandonedCartRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("cart_items")
    .select(
      [
        "id",
        "user_id",
        "quantity",
        "updated_at",
        "users!inner(first_name, last_name, phone)",
        "product_variants!inner(id, sku, price, product_id, products!inner(id, name))",
      ].join(", "),
    )
    .order("updated_at", { ascending: false })
    .limit(Math.min(limit, 500));
  if (error) {
    console.error("[carts-admin] fetch", error.message);
    return [];
  }
  const rows: AbandonedCartRow[] = [];
  for (const row of (data ?? []) as unknown[]) {
    const r = row as {
      id: string;
      user_id: string;
      quantity: number;
      updated_at: string;
      users: { first_name: string; last_name: string; phone: string } | null;
      product_variants: {
        id: string;
        sku: string;
        price: number;
        product_id: string;
        products: { id: string; name: string };
      } | null;
    };
    const u = r.users;
    const pv = r.product_variants;
    if (!pv) continue;
    rows.push({
      id: r.id,
      user_id: r.user_id,
      quantity: r.quantity,
      updated_at: r.updated_at,
      customer_name: [u?.first_name, u?.last_name].filter(Boolean).join(" ") || "—",
      customer_phone: u?.phone?.trim() || "—",
      variant_sku: pv.sku,
      product_name: pv.products.name,
      product_id: pv.product_id,
      unit_price: Number(pv.price) || 0,
    });
  }
  return rows;
}
