/**
 * Lock BBQ meat marinade injector aggregates after review import.
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
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);
const id = "60394d2a-a642-4b22-8482-4548154f24d0";
const slug = "bbq-meat-marinade-injector";
const BREAKDOWN = [174, 10, 2, 0, 2];

const { data: product } = await sb.from("products").select("tags").eq("id", id).single();
const tags = Array.isArray(product?.tags) ? [...product.tags] : [];
const nextTags = tags.filter((t) => !String(t).startsWith("rating_breakdown:"));
nextTags.push(`rating_breakdown:${BREAKDOWN.join(",")}`);

const { error } = await sb
  .from("products")
  .update({
    rating: 4.9,
    reviews_count: 189,
    tags: nextTags,
    updated_at: new Date().toISOString(),
  })
  .eq("id", id);
if (error) throw error;

const { data } = await sb
  .from("products")
  .select("rating,reviews_count,tags")
  .eq("id", id)
  .single();
const { count } = await sb
  .from("reviews")
  .select("id", { count: "exact", head: true })
  .eq("product_id", id)
  .eq("status", "approved");

console.log(JSON.stringify({ product: data, approvedReviews: count }, null, 2));

await fetch("https://www.simplecartstore.com/api/revalidate-review-surface", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ productSlug: slug }),
});
console.log("revalidated");
