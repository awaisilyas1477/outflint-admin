/**
 * Import Daraz reviews JSON into Supabase `reviews` + update product aggregates.
 * Usage: node scripts/import-daraz-reviews.mjs [path-to-json]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath =
  process.argv[2] ||
  resolve(root, "scripts/.daraz-reviews-563842089.json");

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

const MONTHS = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** Parse Daraz dates like "16 Sep 2025" → ISO (noon UTC). */
function parseDarazDate(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const mon = MONTHS[m[2].toLowerCase()];
    const year = Number(m[3]);
    if (mon == null || !day || !year) return new Date().toISOString();
    return new Date(Date.UTC(year, mon, day, 12, 0, 0)).toISOString();
  }
  const now = new Date();
  const days = s.match(/^(\d+)\s+days?\s+ago$/i);
  if (days) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
    d.setUTCDate(d.getUTCDate() - Number(days[1]));
    return d.toISOString();
  }
  const weeks = s.match(/^(\d+)\s+weeks?\s+ago$/i);
  if (weeks) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
    d.setUTCDate(d.getUTCDate() - Number(weeks[1]) * 7);
    return d.toISOString();
  }
  if (/^1\s+week\s+ago$/i.test(s) || /^a\s+week\s+ago$/i.test(s)) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString();
  }
  if (/^a\s+day\s+ago$/i.test(s)) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString();
  }
  return new Date().toISOString();
}

function cleanName(name) {
  return String(name || "")
    .replace(/\s*Verified Purchase\s*/gi, " ")
    .replace(/\s+from\s+daraz\.pk/gi, "")
    .replace(/\bDaraz\s+Guest\b/gi, "Customer")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "Customer";
}

function brandSafeText(s) {
  return String(s || "")
    .replace(/\bDaraz\b/gi, "SimpleCart")
    .replace(/\bdaraz\b/gi, "SimpleCart")
    .replace(/\bdraz\b/gi, "SimpleCart")
    .replace(/\bdarz\b/gi, "SimpleCart");
}

function toDateTitle(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clampRating(n) {
  const x = Math.round(Number(n) || 5);
  return Math.min(5, Math.max(1, x));
}

const e = loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const slugPrefer = process.argv[3] || process.env.PRODUCT_SLUG || "";

const payload = JSON.parse(readFileSync(jsonPath, "utf8"));
const itemId = String(payload.itemId || "563842089");
const average = Number(payload.average) || 0;
const rateCount = Number(payload.rateCount) || (payload.reviews || []).length;
const reviews = Array.isArray(payload.reviews) ? payload.reviews : [];
const scores = Array.isArray(payload.scores) ? payload.scores : null;

// Match product by variant SKU containing Daraz item id, else by explicit slug.
const { data: variants, error: vErr } = await sb
  .from("product_variants")
  .select("id, product_id, sku")
  .ilike("sku", `%${itemId}%`);
if (vErr) throw new Error(vErr.message);

let productIds = [...new Set((variants || []).map((v) => v.product_id))];
if (!productIds.length && slugPrefer) {
  const { data: bySlug, error: sErr } = await sb
    .from("products")
    .select("id")
    .eq("slug", slugPrefer)
    .eq("status", "active")
    .maybeSingle();
  if (sErr) throw new Error(sErr.message);
  if (bySlug?.id) productIds = [bySlug.id];
}
if (!productIds.length) throw new Error(`No product matched itemId ${itemId}`);

const { data: products } = await sb
  .from("products")
  .select("id, name, slug, status, tags")
  .in("id", productIds)
  .eq("status", "active");

let product =
  (slugPrefer && (products || []).find((p) => p.slug === slugPrefer)) ||
  (products || [])[0];
if (!product) throw new Error(`No active product for itemId ${itemId}`);

console.log(`Product: ${product.name} (${product.slug}) id=${product.id}`);
console.log(`Importing ${reviews.length} reviews; aggregate ${average}/5 (${rateCount})`);

// Clear attributed imports for this product (re-import safe)
const { data: existing } = await sb
  .from("reviews")
  .select("id")
  .eq("product_id", product.id)
  .is("user_id", null);

if (existing?.length) {
  const ids = existing.map((r) => r.id);
  await sb.from("reviews").delete().in("id", ids);
  console.log(`Cleared ${ids.length} previous attributed imports`);
}

function collectReviewImageUrls(r) {
  const out = [];
  const push = (u) => {
    if (!u) return;
    let url = String(u).trim();
    if (url.startsWith("//")) url = `https:${url}`;
    if (/^https?:\/\//i.test(url) && out.length < 6) out.push(url);
  };
  for (const src of [r.images, r.media, r.reviewImages, r.imageList, r.mediaList]) {
    if (!Array.isArray(src)) continue;
    for (const x of src) {
      if (typeof x === "string") push(x);
      else if (x && typeof x === "object") {
        push(x.url || x.src || x.imageUrl || x.coverUrl || x.mediaUrl);
      }
    }
  }
  return [...new Set(out)];
}

const rows = [];
const seen = new Set();
for (const r of reviews) {
  const name = cleanName(r.reviewer || r.buyerName || r.userName);
  const rawBody = String(r.reviewContent || r.content || r.review || "").trim();
  const imageUrls = collectReviewImageUrls(r);
  const hasImages = imageUrls.length > 0;
  // Keep photo-only reviews (no text) so gallery images are not dropped.
  const body = brandSafeText(rawBody || (hasImages ? "Photo review" : ""));
  if (!body) continue;
  const created = parseDarazDate(r.reviewTime);
  const rating = clampRating(r.rating);
  const dedupe = `${name}|${created}|${body.slice(0, 100)}|${imageUrls[0] || ""}`;
  if (seen.has(dedupe)) continue;
  seen.add(dedupe);

  const media = imageUrls.map((url) => ({ url, kind: "image" }));

  rows.push({
    product_id: product.id,
    user_id: null,
    attributed_display_name: name,
    attributed_display_email: null,
    rating,
    title: toDateTitle(created),
    body,
    status: "approved",
    media,
    created_at: created,
    updated_at: created,
  });
}

// Insert in batches
const BATCH = 50;
let inserted = 0;
const errors = [];
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH);
  const { error } = await sb.from("reviews").insert(chunk);
  if (error) {
    errors.push(error.message);
    console.error("batch fail", error.message);
  } else {
    inserted += chunk.length;
    console.log(`Inserted ${inserted}/${rows.length}`);
  }
}

// Update product aggregates to match Daraz summary + optional score breakdown tag
const tags = Array.isArray(product.tags) ? [...product.tags] : [];
const nextTags = tags.filter((t) => !String(t).startsWith("rating_breakdown:"));
if (scores && scores.length === 5) {
  nextTags.push(`rating_breakdown:${scores.map((n) => Math.round(Number(n) || 0)).join(",")}`);
}

const { error: pErr } = await sb
  .from("products")
  .update({
    rating: average > 0 ? average : null,
    reviews_count: rateCount,
    tags: nextTags,
    updated_at: new Date().toISOString(),
  })
  .eq("id", product.id);
if (pErr) errors.push(pErr.message);

const summary = {
  productId: product.id,
  slug: product.slug,
  inserted,
  skippedEmpty: reviews.length - rows.length,
  average,
  rateCount,
  errors,
};
writeFileSync(
  resolve(root, "scripts/.daraz-reviews-import-summary.json"),
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary));
