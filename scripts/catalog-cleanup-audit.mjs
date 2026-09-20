/**
 * Full catalog cleanup audit: duplicates, shared images, compare-at gaps.
 * Usage: node scripts/catalog-cleanup-audit.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
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
function norm(n) {
  return String(n || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function keyTokens(n) {
  const stop = new Set([
    "in", "the", "and", "for", "with", "of", "a", "to", "ml", "pcs", "pk",
    "pakistan", "online", "buy", "hot", "cold", "new", "imported",
  ]);
  return norm(n)
    .split(" ")
    .filter((t) => t.length > 2 && !stop.has(t))
    .slice(0, 6)
    .join(" ");
}

const e = loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);

const { data: products } = await sb
  .from("products")
  .select("id,name,slug,status,created_at,short_description")
  .eq("status", "active")
  .order("created_at", { ascending: true });
const ids = products.map((p) => p.id);

const { data: variants } = await sb
  .from("product_variants")
  .select("id,product_id,sku,price,compare_at_price,created_at")
  .in("product_id", ids);
const { data: assets } = await sb
  .from("product_assets")
  .select("id,product_id,url,sort_order,kind,alt_text")
  .in("product_id", ids)
  .order("sort_order", { ascending: true });
const { data: links } = await sb
  .from("product_collections")
  .select("product_id,collection_id")
  .in("product_id", ids);

const varsBy = new Map();
for (const v of variants || []) {
  if (!varsBy.has(v.product_id)) varsBy.set(v.product_id, []);
  varsBy.get(v.product_id).push(v);
}
const assetsBy = new Map();
const urlToProducts = new Map();
for (const a of assets || []) {
  if (!assetsBy.has(a.product_id)) assetsBy.set(a.product_id, []);
  assetsBy.get(a.product_id).push(a);
  if (a.url) {
    if (!urlToProducts.has(a.url)) urlToProducts.set(a.url, new Set());
    urlToProducts.get(a.url).add(a.product_id);
  }
}

// fingerprint: first image filename + price
function fingerprint(p) {
  const imgs = assetsBy.get(p.id) || [];
  const first = imgs[0]?.url || "";
  const file = first.split("/").pop()?.split("?")[0] || "";
  const price = (varsBy.get(p.id) || [])[0]?.price ?? 0;
  return `${file}|${price}`;
}

const byName = new Map();
const byTokens = new Map();
const byFp = new Map();
for (const p of products) {
  const nk = norm(p.name);
  if (!byName.has(nk)) byName.set(nk, []);
  byName.get(nk).push(p);
  const tk = keyTokens(p.name);
  if (tk.length >= 10) {
    if (!byTokens.has(tk)) byTokens.set(tk, []);
    byTokens.get(tk).push(p);
  }
  const fp = fingerprint(p);
  if (fp.length > 5) {
    if (!byFp.has(fp)) byFp.set(fp, []);
    byFp.get(fp).push(p);
  }
}

function enrich(group) {
  return group.map((p) => {
    const vs = varsBy.get(p.id) || [];
    const imgs = assetsBy.get(p.id) || [];
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      created_at: p.created_at,
      price: vs[0]?.price ?? null,
      compare_at: vs[0]?.compare_at_price ?? null,
      imageCount: imgs.length,
      firstImage: imgs[0]?.url?.slice(0, 80) || "",
    };
  });
}

const exactDups = [...byName.entries()]
  .filter(([, g]) => g.length > 1)
  .map(([k, g]) => ({ key: k, items: enrich(g) }));

const tokenDups = [...byTokens.entries()]
  .filter(([, g]) => g.length > 1)
  .map(([k, g]) => ({ key: k, items: enrich(g) }));

const fpDups = [...byFp.entries()]
  .filter(([, g]) => g.length > 1)
  .map(([k, g]) => ({ key: k, items: enrich(g) }));

// Merge duplicate candidate sets: same name OR same first-image+price
const keepDrop = []; // {keep, drop[], reason}
const seenDrop = new Set();

function proposeKeepDrop(items, reason) {
  if (items.length < 2) return;
  // keep oldest with most images, then with compare_at
  const sorted = [...items].sort((a, b) => {
    const imgDiff = (b.imageCount || 0) - (a.imageCount || 0);
    if (imgDiff !== 0) return imgDiff;
    const ca = a.compare_at != null && Number(a.compare_at) > Number(a.price) ? 1 : 0;
    const cb = b.compare_at != null && Number(b.compare_at) > Number(b.price) ? 1 : 0;
    if (cb !== ca) return cb - ca;
    return String(a.created_at).localeCompare(String(b.created_at));
  });
  const keep = sorted[0];
  const drops = sorted.slice(1).filter((d) => !seenDrop.has(d.id) && d.id !== keep.id);
  if (!drops.length) return;
  for (const d of drops) seenDrop.add(d.id);
  keepDrop.push({
    reason,
    keep: { id: keep.id, name: keep.name, slug: keep.slug, images: keep.imageCount },
    drop: drops.map((d) => ({ id: d.id, name: d.name, slug: d.slug, images: d.imageCount })),
  });
}

for (const g of exactDups) proposeKeepDrop(g.items, "exact_name");
for (const g of fpDups) proposeKeepDrop(g.items, "same_image_and_price");
// token dups only if also share an image URL
for (const g of tokenDups) {
  const idsIn = g.items.map((i) => i.id);
  let shared = false;
  for (const [, set] of urlToProducts) {
    const hit = [...set].filter((id) => idsIn.includes(id));
    if (hit.length >= 2) {
      shared = true;
      break;
    }
  }
  if (shared) proposeKeepDrop(g.items, "similar_name_shared_image");
}

const sharedUrls = [...urlToProducts.entries()]
  .filter(([, set]) => set.size > 1)
  .map(([url, set]) => ({
    url,
    products: [...set].map((id) => {
      const p = products.find((x) => x.id === id);
      return { id, name: p?.name, slug: p?.slug };
    }),
  }));

let withCompare = 0;
let withoutCompare = 0;
const missingCompareProducts = [];
for (const p of products) {
  const vs = varsBy.get(p.id) || [];
  const has = vs.some((v) => v.compare_at_price != null && Number(v.compare_at_price) > Number(v.price));
  if (has) withCompare++;
  else {
    withoutCompare++;
    missingCompareProducts.push({
      id: p.id,
      name: p.name,
      price: vs[0]?.price ?? null,
      slug: p.slug,
    });
  }
}

const report = {
  active: products.length,
  exactDuplicateGroups: exactDups.length,
  fingerprintDuplicateGroups: fpDups.length,
  tokenDuplicateGroups: tokenDups.length,
  proposedDeactivations: keepDrop,
  dropCount: keepDrop.reduce((n, x) => n + x.drop.length, 0),
  sharedImageUrlGroups: sharedUrls.length,
  sharedImageSamples: sharedUrls.slice(0, 15),
  pricing: {
    productsWithCompareAt: withCompare,
    productsWithoutCompareAt: withoutCompare,
    missingSample: missingCompareProducts.slice(0, 20),
  },
};

writeFileSync(resolve(root, "scripts/.catalog-cleanup-audit.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
