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
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const e = loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);

const { data: products } = await sb.from("products").select("id,name").eq("status", "active");
const ids = (products ?? []).map((p) => p.id);
const { data: vars } = await sb
  .from("product_variants")
  .select("id,product_id,sku,price,compare_at_price,option_values")
  .in("product_id", ids);
const { data: inv } = await sb
  .from("inventory")
  .select("product_variant_id,quantity_on_hand")
  .in("product_variant_id", (vars ?? []).map((v) => v.id));

const invMap = new Map((inv ?? []).map((r) => [r.product_variant_id, r.quantity_on_hand ?? 0]));
const byProduct = new Map();
for (const v of vars ?? []) {
  const list = byProduct.get(v.product_id) ?? [];
  list.push({ ...v, stock: invMap.get(v.id) ?? 0 });
  byProduct.set(v.product_id, list);
}

const zeroStock = [];
const badCompare = [];
const multi = [];

for (const p of products ?? []) {
  const list = byProduct.get(p.id) ?? [];
  if (list.length > 1) {
    multi.push({
      name: p.name,
      variants: list.map((v) => ({
        sku: v.sku,
        price: v.price,
        compare: v.compare_at_price,
        save: v.compare_at_price ? Number(v.compare_at_price) - Number(v.price) : null,
        stock: v.stock,
        ov: v.option_values,
      })),
    });
  }
  for (const v of list) {
    if (v.stock <= 0) zeroStock.push({ product: p.name, sku: v.sku, ov: v.option_values });
    const cmp = v.compare_at_price == null ? null : Number(v.compare_at_price);
    const price = Number(v.price);
    if (cmp == null || cmp <= price) badCompare.push({ product: p.name, sku: v.sku, price, cmp });
  }
}

console.log(JSON.stringify({
  activeProducts: products?.length,
  totalVariants: vars?.length,
  zeroStockCount: zeroStock.length,
  badCompareCount: badCompare.length,
  multiVariantProducts: multi.length,
  zeroStock: zeroStock.slice(0, 10),
  badCompare: badCompare.slice(0, 10),
  multiSamples: multi.filter((m) =>
    /Wavy Bow|Slim Flask|Meat Grinder|Mosquito|Cutlery/i.test(m.name),
  ),
}, null, 2));
