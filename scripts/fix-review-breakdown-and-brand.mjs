/**
 * Set rating breakdown tag (5★→1★ counts from Daraz) + replace Daraz→SimpleCart in review text.
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

const e = load(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PRODUCT_ID = "c6ebea21-043a-4af0-bcfb-b39138dfe6a7";
/** Daraz score bars: 5★,4★,3★,2★,1★ */
const BREAKDOWN = [330, 28, 10, 3, 6];
const BREAKDOWN_TAG = `rating_breakdown:${BREAKDOWN.join(",")}`;

const { data: product } = await sb.from("products").select("id,tags").eq("id", PRODUCT_ID).single();
const tags = Array.isArray(product?.tags) ? [...product.tags] : [];
const nextTags = tags.filter((t) => !String(t).startsWith("rating_breakdown:"));
nextTags.push(BREAKDOWN_TAG);

await sb
  .from("products")
  .update({
    tags: nextTags,
    rating: 4.7,
    reviews_count: 378,
    updated_at: new Date().toISOString(),
  })
  .eq("id", PRODUCT_ID);

const { data: reviews } = await sb
  .from("reviews")
  .select("id, body, title")
  .eq("product_id", PRODUCT_ID);

let replaced = 0;
for (const r of reviews || []) {
  const body = String(r.body || "");
  const title = String(r.title || "");
  const nextBody = body
    .replace(/\bDaraz\b/gi, "SimpleCart")
    .replace(/\bdaraz\b/gi, "SimpleCart");
  const nextTitle = title
    .replace(/\bDaraz\b/gi, "SimpleCart")
    .replace(/\bdaraz\b/gi, "SimpleCart");
  if (nextBody === body && nextTitle === title) continue;
  const { error } = await sb
    .from("reviews")
    .update({ body: nextBody, title: nextTitle })
    .eq("id", r.id);
  if (!error) replaced++;
}

console.log(JSON.stringify({ breakdownTag: BREAKDOWN_TAG, replacedBodies: replaced }, null, 2));

await fetch("https://www.simplecartstore.com/api/revalidate-review-surface", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ productSlug: "round-glass-cup-with-wooden-lid" }),
});
