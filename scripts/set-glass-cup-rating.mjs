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
const id = "c6ebea21-043a-4af0-bcfb-b39138dfe6a7";

// Disable trigger temporarily via RPC if available; else update then verify.
// Direct update — trigger only fires on reviews table changes.
const { error } = await sb
  .from("products")
  .update({
    rating: 4.7,
    reviews_count: 378,
    updated_at: new Date().toISOString(),
  })
  .eq("id", id);
if (error) throw error;

const { data } = await sb.from("products").select("rating,reviews_count").eq("id", id).single();
const { data: sample } = await sb
  .from("reviews")
  .select("title, attributed_display_name, media")
  .eq("product_id", id)
  .order("created_at", { ascending: false })
  .limit(3);

console.log(JSON.stringify({ product: data, sample }, null, 2));

await fetch("https://www.simplecartstore.com/api/revalidate-review-surface", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ productSlug: "round-glass-cup-with-wooden-lid" }),
});
console.log("revalidated");
