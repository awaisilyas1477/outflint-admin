/**
 * Fix route SEO titles so storefront suffixTitle doesn't double the brand.
 * Storefront env NEXT_PUBLIC_SITE_NAME appends "| SimpleCartStore".
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
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

const ROUTES = {
  "/": {
    title: "Home, Kitchen & Beauty Essentials",
    description:
      "Shop tumblers, water bottles, kitchen tools, beauty gadgets and home essentials at SimpleCart Store. Quality products, fair prices, and delivery across Pakistan.",
  },
  "/collections": {
    title: "Shop All Products",
    description:
      "Browse drinkware, kitchen tools, beauty gadgets, heaters and home essentials at SimpleCart Store. Quality picks with delivery across Pakistan.",
  },
  "/collections/sale": {
    title: "Sale & Deals",
    description:
      "Explore sale deals on home, kitchen and beauty essentials at SimpleCart Store. Save on popular products with delivery across Pakistan.",
  },
  "/bundles": {
    title: "Product Bundles & Combos",
    description:
      "Shop curated product bundles at SimpleCart Store — convenient home and kitchen combos with delivery across Pakistan.",
  },
  "/contact": {
    title: "Contact & Customer Support",
    description:
      "Need help with an order or product? Contact SimpleCart Store for support, delivery questions, and shopping assistance across Pakistan.",
  },
  "/search": {
    title: "Search Products",
    description:
      "Search tumblers, bottles, kitchen tools, beauty gadgets and home essentials at SimpleCart Store.",
  },
};

for (const [key, val] of Object.entries(ROUTES)) {
  const { data: existing } = await sb
    .from("seo_meta")
    .select("id")
    .eq("subject_type", "route")
    .eq("subject_key", key)
    .eq("locale", "en")
    .maybeSingle();
  if (!existing?.id) {
    console.log("missing route", key);
    continue;
  }
  const { error } = await sb
    .from("seo_meta")
    .update({ title: val.title, description: val.description })
    .eq("id", existing.id);
  if (error) throw error;
  console.log("fixed", key, "→", val.title);
}

// Also strip brand from product seo titles if they already contain it
const { data: products } = await sb.from("products").select("id").eq("status", "active");
const ids = products.map((p) => p.id);
const { data: seo } = await sb
  .from("seo_meta")
  .select("id,title")
  .eq("subject_type", "product")
  .in("subject_id", ids);

let n = 0;
for (const row of seo || []) {
  let t = row.title || "";
  const cleaned = t
    .replace(/\s*[|·–—-]\s*SimpleCart\s*Store\s*$/i, "")
    .replace(/\s*[|·–—-]\s*SimpleCartStore\s*$/i, "")
    .trim();
  if (cleaned !== t) {
    await sb.from("seo_meta").update({ title: cleaned }).eq("id", row.id);
    n++;
  }
}
console.log("product titles cleaned:", n);
