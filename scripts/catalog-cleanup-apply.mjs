/**
 * Catalog cleanup:
 * 1) Draft true duplicate products (same primary image + price)
 * 2) Remove cross-contaminated shared images from non-owner products
 * 3) Backfill compare_at_price (~20% above sale) where missing
 *
 * Usage: node scripts/catalog-cleanup-apply.mjs [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");

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

const audit = JSON.parse(
  readFileSync(resolve(root, "scripts/.catalog-cleanup-audit.json"), "utf8"),
);

const dropIds = new Set();
const keepIds = new Set();
for (const g of audit.proposedDeactivations || []) {
  keepIds.add(g.keep.id);
  for (const d of g.drop) dropIds.add(d.id);
}

// Extra: slim flask pair (shared images, may differ slightly on fingerprint)
const EXTRA_DROP = ["6638aed9-1f6e-4644-a347-3c68468b6b61"]; // keep af54bb0a
for (const id of EXTRA_DROP) dropIds.add(id);

console.log(DRY ? "DRY RUN" : "LIVE", "drafting", dropIds.size, "duplicates");

const stats = { drafted: 0, imagesRemoved: 0, compareFilled: 0, errors: [] };

for (const id of dropIds) {
  if (DRY) {
    stats.drafted++;
    continue;
  }
  const { error } = await sb
    .from("products")
    .update({ status: "draft", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "active");
  if (error) stats.errors.push(`draft ${id}: ${error.message}`);
  else stats.drafted++;
}

// --- Image decontamination among remaining active products ---
const { data: active } = await sb
  .from("products")
  .select("id,name,created_at")
  .eq("status", "active");
const activeIds = (active || []).map((p) => p.id);
const createdBy = new Map((active || []).map((p) => [p.id, p.created_at]));

const { data: assets } = await sb
  .from("product_assets")
  .select("id,product_id,url,sort_order")
  .in("product_id", activeIds)
  .order("sort_order", { ascending: true });

const byUrl = new Map();
for (const a of assets || []) {
  if (!a.url) continue;
  if (!byUrl.has(a.url)) byUrl.set(a.url, []);
  byUrl.get(a.url).push(a);
}

const assetIdsToDelete = [];
for (const [url, rows] of byUrl) {
  if (rows.length < 2) continue;
  // Owner = product where this URL has the lowest sort_order; tie → oldest product
  const ranked = [...rows].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return String(createdBy.get(a.product_id) || "").localeCompare(
      String(createdBy.get(b.product_id) || ""),
    );
  });
  const ownerId = ranked[0].product_id;
  for (const r of ranked.slice(1)) {
    if (r.product_id === ownerId) continue;
    assetIdsToDelete.push(r.id);
  }
}

console.log("shared-image removals:", assetIdsToDelete.length);
if (!DRY && assetIdsToDelete.length) {
  // delete in chunks
  for (let i = 0; i < assetIdsToDelete.length; i += 50) {
    const chunk = assetIdsToDelete.slice(i, i + 50);
    const { error } = await sb.from("product_assets").delete().in("id", chunk);
    if (error) stats.errors.push(`asset delete: ${error.message}`);
    else stats.imagesRemoved += chunk.length;
  }
} else {
  stats.imagesRemoved = assetIdsToDelete.length;
}

// Sync products.images JSON array with remaining assets for active products
if (!DRY) {
  const { data: leftAssets } = await sb
    .from("product_assets")
    .select("product_id,url,sort_order")
    .in("product_id", activeIds)
    .order("sort_order", { ascending: true });
  const urlsBy = new Map();
  for (const a of leftAssets || []) {
    if (!urlsBy.has(a.product_id)) urlsBy.set(a.product_id, []);
    if (a.url) urlsBy.get(a.product_id).push(a.url);
  }
  for (const pid of activeIds) {
    const urls = urlsBy.get(pid) || [];
    await sb.from("products").update({ images: urls }).eq("id", pid);
  }
}

// --- compare_at backfill (~22% above price, rounded) ---
function suggestCompare(price) {
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return null;
  const raw = p * 1.22;
  // round to nearest 50 under 5000, else 100
  const step = p < 5000 ? 50 : 100;
  let cmp = Math.ceil(raw / step) * step;
  if (cmp <= p) cmp = p + step;
  return cmp;
}

const { data: variants } = await sb
  .from("product_variants")
  .select("id,product_id,price,compare_at_price")
  .in("product_id", activeIds);

for (const v of variants || []) {
  const price = Number(v.price) || 0;
  const existing = v.compare_at_price == null ? null : Number(v.compare_at_price);
  if (existing != null && existing > price) continue;
  const cmp = suggestCompare(price);
  if (!cmp) continue;
  if (DRY) {
    stats.compareFilled++;
    continue;
  }
  const { error } = await sb
    .from("product_variants")
    .update({ compare_at_price: cmp })
    .eq("id", v.id);
  if (error) stats.errors.push(`compare ${v.id}: ${error.message}`);
  else stats.compareFilled++;
}

// Also update seo_meta og for kept products if needed — skip

const { count: activeCount } = await sb
  .from("products")
  .select("id", { count: "exact", head: true })
  .eq("status", "active");
const { count: draftCount } = await sb
  .from("products")
  .select("id", { count: "exact", head: true })
  .eq("status", "draft");

const summary = {
  dry: DRY,
  stats,
  activeCount,
  draftCount,
  droppedIds: [...dropIds],
};
writeFileSync(resolve(root, "scripts/.catalog-cleanup-result.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
