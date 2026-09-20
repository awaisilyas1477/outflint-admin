/**
 * Set product out of stock: stock_total=0 + inventory.quantity_on_hand=0
 * Usage: node scripts/_set-oos.mjs <slug> [daraz:tag]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    out[t.slice(0, eq).trim()] = t
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/\s+#.*$/, "");
  }
  return out;
}

const e = loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const slug = String(process.argv[2] || "").trim();
if (!slug) {
  console.error("Usage: node scripts/_set-oos.mjs <slug> [daraz:tag]");
  process.exit(1);
}

const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);
const { data: product, error } = await sb
  .from("products")
  .select("id, slug, name, stock_total, tags")
  .eq("slug", slug)
  .maybeSingle();
if (error || !product) {
  console.error(error || "Product not found");
  process.exit(1);
}

const tags = Array.isArray(product.tags) ? [...product.tags] : [];
const darazTag = process.argv[3]?.trim();
if (darazTag && !tags.includes(darazTag)) tags.push(darazTag);

await sb.from("products").update({ stock_total: 0, tags }).eq("id", product.id);

const { data: variants } = await sb
  .from("product_variants")
  .select("id")
  .eq("product_id", product.id);
const ids = (variants ?? []).map((v) => v.id);
if (ids.length) {
  await sb
    .from("inventory")
    .update({ quantity_on_hand: 0 })
    .in("product_variant_id", ids);
}

console.log({
  slug: product.slug,
  stock_total: 0,
  variants: ids.length,
  tag: darazTag || null,
});
