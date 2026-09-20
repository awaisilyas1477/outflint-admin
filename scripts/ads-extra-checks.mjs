/**
 * Extra live + DB checks for ads readiness (beyond ads-readiness-audit).
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
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);

const sitemap = await (await fetch("https://www.simplecartstore.com/sitemap.xml", { cache: "no-store" })).text();
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
console.log("sitemap urls:", urls.length);
console.log("product urls:", urls.filter((u) => u.includes("/products/")).length);
console.log("collection urls:", urls.filter((u) => u.includes("/collections/")).length);

const { data: products } = await sb
  .from("products")
  .select("id,slug,name,status")
  .eq("status", "active")
  .limit(3);
for (const p of products || []) {
  const res = await fetch(`https://www.simplecartstore.com/products/${p.slug}`, {
    cache: "no-store",
  });
  const html = await res.text();
  const hasLd = html.includes("application/ld+json") && /"@type"\s*:\s*"Product"/i.test(html);
  const hasOg = html.includes('property="og:title"');
  console.log(`PDP ${p.slug}: status=${res.status} productLd=${hasLd} og=${hasOg}`);
}

// Inventory sellable
const { data: vars } = await sb
  .from("product_variants")
  .select("id,product_id,price")
  .in(
    "product_id",
    (await sb.from("products").select("id").eq("status", "active")).data.map((p) => p.id),
  );
const varIds = vars.map((v) => v.id);
const { data: inv } = await sb
  .from("inventory")
  .select("product_variant_id,quantity_on_hand,quantity_reserved")
  .in("product_variant_id", varIds);
const invBy = new Map((inv || []).map((i) => [i.product_variant_id, i]));
let sellableProducts = new Set();
let zeroStockProducts = new Set();
const productIds = new Set(vars.map((v) => v.product_id));
for (const v of vars) {
  const i = invBy.get(v.id);
  const sellable = Math.max(0, (i?.quantity_on_hand ?? 0) - (i?.quantity_reserved ?? 0));
  if (sellable > 0) sellableProducts.add(v.product_id);
}
for (const pid of productIds) {
  if (!sellableProducts.has(pid)) zeroStockProducts.add(pid);
}
console.log({
  variants: vars.length,
  productsWithStock: sellableProducts.size,
  productsZeroStock: zeroStockProducts.size,
});

// Payment / shipping settings presence
const { data: settings } = await sb.from("store_settings").select("*").eq("id", 1).maybeSingle();
console.log("store keys sample:", Object.keys(settings || {}).filter((k) =>
  /ship|pay|cod|whats|phone|email|currency|checkout/i.test(k),
));

const home = await (await fetch("https://www.simplecartstore.com/", { cache: "no-store" })).text();
console.log("has gtag config:", home.includes("G-HLEMH46BSK"));
console.log("has ga4 ecommerce helper hint in chunk unlikely — skip");

// Sample product chunk for trackGa4 / view_item — fetch a PDP and look for script references
const slug = products?.[0]?.slug;
if (slug) {
  const pdp = await (await fetch(`https://www.simplecartstore.com/products/${slug}`, { cache: "no-store" })).text();
  const chunkRefs = [...pdp.matchAll(/\/_next\/static\/chunks\/[^"]+\.js/g)].map((m) => m[0]);
  console.log("pdp chunk refs", chunkRefs.length);
}
