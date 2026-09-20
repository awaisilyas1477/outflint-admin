/**
 * Recompute products.rating / reviews_count / rating_breakdown tags
 * from approved rows in `reviews` (source of truth).
 *
 * Usage: node scripts/sync-review-stats-from-rows.mjs
 */
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

const e = {
  ...load(resolve(root, "../../w-cartstore-web/e-commerce-website/.env")),
  ...load(resolve(root, ".env")),
};
const url = e.NEXT_PUBLIC_SUPABASE_URL || e.VITE_SUPABASE_URL;
const key = e.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase URL or service role key");
  process.exit(1);
}

const sb = createClient(url, key);

const products = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("products")
    .select("id, slug, tags, reviews_count, rating, reviews_stats_locked")
    .order("id", { ascending: true })
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  if (!data?.length) break;
  products.push(...data);
  if (data.length < 1000) break;
}

let updated = 0;
let skippedLocked = 0;
let sumBefore = 0;
let sumAfter = 0;
const errors = [];

for (const p of products) {
  sumBefore += Number(p.reviews_count || 0);

  if (p.reviews_stats_locked) {
    skippedLocked++;
    sumAfter += Number(p.reviews_count || 0);
    continue;
  }

  const stars = [5, 4, 3, 2, 1];
  const starCounts = [];
  for (const star of stars) {
    const { count, error } = await sb
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("product_id", p.id)
      .eq("status", "approved")
      .eq("rating", star);
    if (error) {
      errors.push(`${p.slug}: ${error.message}`);
      starCounts.push(0);
      continue;
    }
    starCounts.push(count ?? 0);
  }

  const total = starCounts.reduce((a, b) => a + b, 0);
  let avg = 0;
  if (total > 0) {
    const weighted = stars.reduce((acc, star, i) => acc + star * starCounts[i], 0);
    avg = Math.round((weighted / total) * 100) / 100;
  }

  const tags = Array.isArray(p.tags) ? [...p.tags] : [];
  const nextTags = tags.filter((t) => !String(t).startsWith("rating_breakdown:"));
  if (total > 0) {
    nextTags.push(`rating_breakdown:${starCounts.join(",")}`);
  }

  const { error: upErr } = await sb
    .from("products")
    .update({
      reviews_count: total,
      rating: total > 0 ? avg : 0,
      tags: nextTags,
      updated_at: new Date().toISOString(),
    })
    .eq("id", p.id);

  if (upErr) {
    errors.push(`${p.slug}: ${upErr.message}`);
    sumAfter += Number(p.reviews_count || 0);
    continue;
  }

  updated++;
  sumAfter += total;
}

const { count: reviewsTotal } = await sb
  .from("reviews")
  .select("id", { count: "exact", head: true })
  .eq("status", "approved");

console.log(
  JSON.stringify(
    {
      products: products.length,
      updated,
      skippedLocked,
      sumBefore,
      sumAfter,
      approvedReviewsInTable: reviewsTotal ?? 0,
      errorCount: errors.length,
      errors: errors.slice(0, 10),
    },
    null,
    2,
  ),
);
