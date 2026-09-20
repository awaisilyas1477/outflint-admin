import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function load(path) {
  const out = {};
  if (!existsSync(path)) return out;
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

const e = load(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);
const urls = JSON.parse(readFileSync(resolve(root, "scripts/.daraz-source-urls.json"), "utf8"));
const itemIds = new Set(urls.map((u) => (u.match(/-i(\d+)/i) || [])[1]).filter(Boolean));

const prodRes = await sb.from("products").select("id,name,slug,status,images");
if (prodRes.error) {
  console.error("products error", prodRes.error);
  process.exit(1);
}
const products = prodRes.data;
const varRes = await sb.from("product_variants").select("product_id,sku,price,compare_at_price");
if (varRes.error) {
  console.error("variants error", varRes.error);
  process.exit(1);
}
const variants = varRes.data;
const byPid = Object.fromEntries((variants || []).map((v) => [v.product_id, v]));
console.error("loaded products", products?.length, "variants", variants?.length);

const active = (products || []).filter((p) => p.status === "active");
const draft = (products || []).filter((p) => p.status === "draft");

const unmatched = [];
const withCmp = [];
const itemCounts = new Map();
const primaryMap = new Map();

for (const p of active) {
  const v = byPid[p.id] || {};
  const item = (String(v.sku || "").match(/^(\d+)/) || [])[1] || null;
  if (!item || !itemIds.has(item)) unmatched.push({ name: p.name, sku: v.sku, price: v.price, cmp: v.compare_at_price });
  if (v.compare_at_price != null) {
    withCmp.push({
      name: p.name,
      price: v.price,
      cmp: v.compare_at_price,
      ratio: Number(v.compare_at_price) / Number(v.price),
      sku: v.sku,
    });
  }
  if (item) itemCounts.set(item, (itemCounts.get(item) || 0) + 1);
  const img = (p.images || [])[0];
  if (img) {
    if (!primaryMap.has(img)) primaryMap.set(img, []);
    primaryMap.get(img).push(p.name);
  }
}

const dups = [...itemCounts.entries()].filter(([, n]) => n > 1);
const shared = [...primaryMap.entries()].filter(([, n]) => n.length > 1);

console.log(
  JSON.stringify(
    {
      sourceUrls: urls.length,
      sourceItemIds: itemIds.size,
      active: active.length,
      draft: draft.length,
      unmatched,
      withCompare: withCmp,
      activeDupItemIds: dups,
      sharedPrimaryGroups: shared.map(([img, names]) => ({ img: img.slice(0, 70), names })),
    },
    null,
    2,
  ),
);
