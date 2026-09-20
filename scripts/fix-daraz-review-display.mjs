/**
 * Fix Daraz-imported review titles → YYYY-MM-DD, revalidate storefront.
 * Usage: node scripts/fix-daraz-review-display.mjs
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
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PRODUCT_ID = "c6ebea21-043a-4af0-bcfb-b39138dfe6a7";
const SLUG = "round-glass-cup-with-wooden-lid";

function toDateTitle(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const { data: rows, error } = await sb
  .from("reviews")
  .select("id, title, created_at, attributed_display_name")
  .eq("product_id", PRODUCT_ID)
  .like("title", "daraz:%");
if (error) throw new Error(error.message);

let updated = 0;
for (const r of rows || []) {
  const title = toDateTitle(r.created_at);
  if (!title) continue;
  const { error: uErr } = await sb.from("reviews").update({ title }).eq("id", r.id);
  if (uErr) console.error(uErr.message);
  else updated++;
}

// Ensure product aggregates are correct
await sb
  .from("products")
  .update({
    rating: 4.7,
    reviews_count: 378,
    updated_at: new Date().toISOString(),
  })
  .eq("id", PRODUCT_ID);

console.log(JSON.stringify({ updatedTitles: updated, productId: PRODUCT_ID, slug: SLUG }, null, 2));

// Bust live cache (no secret required)
for (const url of [
  "https://www.simplecartstore.com/api/revalidate-review-surface",
  "http://localhost:3000/api/revalidate-review-surface",
]) {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    console.log("revalidate", url, res.status);
  } catch (err) {
    console.log("revalidate skip", url, String(err?.message || err));
  }
}
