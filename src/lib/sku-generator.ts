import { supabase } from "@/lib/supabase/client";

import { ADMIN_MSG_CATALOG_UNAVAILABLE } from "@/lib/admin-user-messages";
/**
 * First word of store name, first three letters A–Z (e.g. "Ayra's Wear" → AYR).
 */
export function prefixFromStoreName(storeName: string): string {
  const raw = storeName.trim();
  if (!raw) return "SKU";
  const firstWord = raw.split(/\s+/)[0] ?? "";
  const letters = firstWord.replace(/[^a-zA-Z]/g, "");
  return (letters + "XXX").slice(0, 3).toUpperCase();
}

async function skuExistsInDatabase(
  sku: string,
  productId?: string | null,
): Promise<boolean> {
  if (!supabase) return true;
  let q = supabase.from("product_variants").select("id").eq("sku", sku);
  if (productId) {
    q = q.eq("product_id", productId);
  }
  const { data, error } = await q.maybeSingle();
  if (error) return true;
  return data != null;
}

/**
 * Pattern: {STORE3}-{NNN}-{NNNN} — middle and tail are numeric; checked against DB + local list.
 */
export async function generateUniqueSkuForProduct(
  storeName: string,
  productSlugHint: string,
  /** SKUs already used on this form (other rows) — must not collide */
  otherSkusOnForm: string[],
  options?: { productId?: string | null },
): Promise<{ sku: string } | { error: string }> {
  if (!supabase) {
    return { error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }

  const prefix = prefixFromStoreName(storeName);
  const slugPart = productSlugHint.replace(/[^a-zA-Z0-9]/g, "") || "prd";
  let midNum = 0;
  for (let i = 0; i < slugPart.length; i++) {
    midNum = (midNum + slugPart.charCodeAt(i) * (i + 7)) % 1000;
  }
  const midBase = String(midNum).padStart(3, "0");
  const avoid = new Set(otherSkusOnForm.map((s) => s.trim()).filter(Boolean));
  const pid = options?.productId?.trim() || null;

  for (let attempt = 0; attempt < 60; attempt++) {
    const mid =
      attempt < 40
        ? midBase
        : String(Math.floor(Math.random() * 1000)).padStart(3, "0");
    const tail = String(Math.floor(1000 + Math.random() * 9000));
    const sku = `${prefix}-${mid}-${tail}`;
    if (avoid.has(sku)) continue;
    if (await skuExistsInDatabase(sku, pid)) continue;
    return { sku };
  }

  for (let attempt = 0; attempt < 30; attempt++) {
    const tail = `${Date.now()}`.slice(-8);
    const sku = `${prefix}-${midBase}-${tail}`;
    if (avoid.has(sku)) continue;
    if (await skuExistsInDatabase(sku, pid)) continue;
    return { sku };
  }

  return { error: "Could not generate a unique SKU. Try again or enter one manually." };
}
