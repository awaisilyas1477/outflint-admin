/**
 * Restore marketplace review totals onto products (and lock them),
 * using max(actual approved rows, known Daraz totals from set-*-rating scripts
 * + previously observed product counters).
 *
 * Usage: node scripts/restore-marketplace-review-totals.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptsDir = resolve(root, "scripts");

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

const e = {
  ...load(resolve(root, "../../w-cartstore-web/e-commerce-website/.env")),
  ...load(resolve(root, ".env")),
};
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL || e.VITE_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);

/** slug → { count, rating?, breakdown?, id? } */
const known = new Map();

function addKnown(slug, count, extra = {}) {
  if (!slug || !Number.isFinite(count) || count <= 0) return;
  const prev = known.get(slug);
  if (!prev || count > prev.count) {
    known.set(slug, { count, ...extra, ...(prev || {}) });
  }
}

// Parse set-*-rating.mjs files
for (const file of readdirSync(scriptsDir)) {
  if (!/^set-.*-rating\.mjs$/.test(file) && file !== "lock-glass-cup-rating.mjs") continue;
  const src = readFileSync(join(scriptsDir, file), "utf8");
  const slug = (src.match(/const slug = "([^"]+)"/) || [])[1]
    || (src.match(/slug:\s*"([^"]+)"/) || [])[1];
  const id = (src.match(/const id = "([^"]+)"/) || [])[1];
  const count = Number((src.match(/reviews_count:\s*(\d+)/) || [])[1]);
  const rating = Number((src.match(/rating:\s*([\d.]+)/) || [])[1]);
  const bd = (src.match(/BREAKDOWN\s*=\s*\[([^\]]+)\]/) || [])[1];
  const breakdown = bd
    ? bd.split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n))
    : null;
  if (slug && count) addKnown(slug, count, { id, rating: Number.isFinite(rating) ? rating : null, breakdown });
}

// Previously observed product counters (before sync wiped them)
const PREVIOUS_SHOWN = {
  "led-eyebrow-trimmer-and-hair-remover": 1385,
  "2l-stainless-steel-electric-kettle": 1350,
  "mini-usb-mosquito-killer-lamp": 1099,
  "ribbed-glass-sipper-with-straw": 1486,
  "400w-foldable-electric-room-heater": 1677,
  "silicone-back-bath-shower-wash-body-belt-brush-bath-towel-exfoliating-body-brush": 634,
  "round-glass-cup-with-wooden-lid": 378,
  "zoomable-metal-cob-flashlight": 364,
  "mini-led-clamp-book-light": 442,
  "sun-halogen-portable-room-heater": 431,
  "reusable-metal-straws-with-brush": 335,
  "pearl-chain-glass-tumbler": 518,
  "6-piece-manicure-pedicure-kit": 497,
  "5-in-1-vegetable-fruit-cutter": 279,
  "rgb-crystal-diamond-table-lamp": 144,
  "garlic-ginger-grinding-press": 282,
  "mesh-metal-pen-holder": 224,
  "wooden-massage-hair-comb": 354,
  "bbq-meat-marinade-injector": 189,
  "1000w-single-electric-stove": 233,
  "350ml-double-wall-borosilicate-mug": 241,
  "striped-mason-glass-tumbler": 284,
  "2l-manual-food-chopper": 199,
  "ceramic-tourmaline-hair-straightener": 168,
  "cartoon-bear-glass-coffee-mug": 225,
};
for (const [slug, count] of Object.entries(PREVIOUS_SHOWN)) {
  addKnown(slug, count);
}

const products = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("products")
    .select("id, slug, tags, rating, reviews_count")
    .order("id", { ascending: true })
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  if (!data?.length) break;
  products.push(...data);
  if (data.length < 1000) break;
}

let updated = 0;
let locked = 0;
let sumAfter = 0;
const errors = [];

for (const p of products) {
  const { count: actual, error: cErr } = await sb
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("product_id", p.id)
    .eq("status", "approved");
  if (cErr) {
    errors.push(`${p.slug}: ${cErr.message}`);
    continue;
  }
  const actualCount = actual ?? 0;
  const k = known.get(p.slug);
  const target = Math.max(actualCount, k?.count ?? 0);
  const shouldLock = Boolean(k && k.count > actualCount);

  // Prefer existing rating if target comes from rows; else known rating; else keep
  let rating = Number(p.rating || 0);
  if (k?.rating && shouldLock) rating = k.rating;
  if (actualCount > 0 && !shouldLock) {
    // keep current rating (already from rows)
  }

  const tags = Array.isArray(p.tags) ? [...p.tags] : [];
  let nextTags = tags.filter((t) => !String(t).startsWith("rating_breakdown:"));
  if (k?.breakdown?.length === 5 && shouldLock) {
    nextTags.push(`rating_breakdown:${k.breakdown.join(",")}`);
  } else {
    // rebuild from actual stars when not locking marketplace totals
    const stars = [5, 4, 3, 2, 1];
    const starCounts = [];
    for (const star of stars) {
      const { count } = await sb
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("product_id", p.id)
        .eq("status", "approved")
        .eq("rating", star);
      starCounts.push(count ?? 0);
    }
    if (starCounts.reduce((a, b) => a + b, 0) > 0) {
      nextTags.push(`rating_breakdown:${starCounts.join(",")}`);
    }
  }

  const { error: upErr } = await sb
    .from("products")
    .update({
      reviews_count: target,
      rating,
      tags: nextTags,
      reviews_stats_locked: shouldLock,
      updated_at: new Date().toISOString(),
    })
    .eq("id", p.id);

  if (upErr) {
    errors.push(`${p.slug}: ${upErr.message}`);
    continue;
  }
  updated++;
  if (shouldLock) locked++;
  sumAfter += target;
}

console.log(
  JSON.stringify(
    {
      products: products.length,
      knownSlugs: known.size,
      updated,
      locked,
      sumAfter,
      errorCount: errors.length,
      errors: errors.slice(0, 8),
    },
    null,
    2,
  ),
);
