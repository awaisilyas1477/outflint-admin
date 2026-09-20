/**
 * Final SEO completeness score after strengthen.
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
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);

const required = [
  "title",
  "description",
  "keywords",
  "canonical_url",
  "og_image_url",
  "og_image_alt",
  "og_image_width",
  "og_image_height",
  "twitter_card",
];

async function score(type, filter = {}) {
  let q = sb.from("seo_meta").select("*").eq("subject_type", type);
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { data } = await q;
  const rows = data || [];
  let complete = 0;
  const missing = {};
  for (const r of rows) {
    let ok = true;
    for (const f of required) {
      const val = r[f];
      const empty =
        val == null ||
        val === "" ||
        (Array.isArray(val) && val.length === 0);
      if (empty) {
        ok = false;
        missing[f] = (missing[f] || 0) + 1;
      }
    }
    // indexable routes/products should have canonical except noindex
    if (!r.noindex && !(r.canonical_url || "").trim()) {
      ok = false;
      missing.canonical_url = (missing.canonical_url || 0) + 1;
    }
    if (ok) complete++;
  }
  return { type, total: rows.length, complete, missing };
}

const scores = [];
for (const t of ["product", "collection", "route", "policy_page", "home_section"]) {
  scores.push(await score(t));
}

const { data: shop } = await sb
  .from("product_shopping_attributes")
  .select("material,brand_name,mpn,country_of_origin");
const mats = (shop || []).filter((s) => (s.material || "").trim()).length;
const brands = (shop || []).filter((s) => (s.brand_name || "").trim()).length;
const mpns = (shop || []).filter((s) => (s.mpn || "").trim()).length;
const origins = (shop || []).filter((s) => (s.country_of_origin || "").trim()).length;

console.log(JSON.stringify({ scores, shopping: { mats, brands, mpns, origins, total: shop?.length } }, null, 2));
