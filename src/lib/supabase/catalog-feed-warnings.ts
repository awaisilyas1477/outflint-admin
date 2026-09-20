import { supabase } from "@/lib/supabase/client";

export type CatalogFeedWarning = {
  id: string;
  kind: "no_image" | "zero_price";
  label: string;
  detail: string;
};

export async function fetchCatalogFeedWarningsAdmin(limit = 12): Promise<CatalogFeedWarning[]> {
  if (!supabase) return [];
  const warnings: CatalogFeedWarning[] = [];

  const { data: products } = await supabase
    .from("products")
    .select("id, name, slug, images, status")
    .eq("status", "active")
    .limit(500);

  for (const p of products ?? []) {
    const images = p.images;
    const hasImage =
      Array.isArray(images) &&
      images.some((x) => typeof x === "string" && x.trim().length > 0);
    if (!hasImage) {
      warnings.push({
        id: `no-img-${p.id}`,
        kind: "no_image",
        label: p.name as string,
        detail: "Active product has no gallery image — may be omitted from Meta/Google feed.",
      });
    }
    if (warnings.length >= limit) break;
  }

  if (warnings.length >= limit) return warnings.slice(0, limit);

  const productIds = (products ?? []).map((p) => p.id as string);
  if (productIds.length === 0) return warnings;

  const { data: variants } = await supabase
    .from("product_variants")
    .select("id, sku, price, product_id, products!inner(id, name, status)")
    .in("product_id", productIds)
    .eq("products.status", "active");

  for (const v of variants ?? []) {
    const row = v as {
      id: string;
      sku: string;
      price: number;
      products: { name: string } | { name: string }[];
    };
    const price = Number(row.price);
    if (!Number.isFinite(price) || price <= 0) {
      const prod = Array.isArray(row.products) ? row.products[0] : row.products;
      warnings.push({
        id: `zero-${row.id}`,
        kind: "zero_price",
        label: prod?.name ?? "Product",
        detail: `SKU ${row.sku} has invalid price — excluded from catalog feed.`,
      });
    }
    if (warnings.length >= limit) break;
  }

  return warnings.slice(0, limit);
}
