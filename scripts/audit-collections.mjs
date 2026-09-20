/**
 * Audit collection membership + asset alts.
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

const { data: products } = await sb
  .from("products")
  .select("id,name,slug,status")
  .eq("status", "active");
const ids = products.map((p) => p.id);

const { data: links } = await sb
  .from("product_collections")
  .select("product_id,collection_id")
  .in("product_id", ids);

const linked = new Set((links || []).map((l) => l.product_id));
const unlinked = products.filter((p) => !linked.has(p.id));

const { data: cols } = await sb.from("collections").select("id,slug,name");
const { data: colSeo } = await sb
  .from("seo_meta")
  .select("subject_id,title,description,keywords")
  .eq("subject_type", "collection");

const { data: assets } = await sb
  .from("product_assets")
  .select("id,product_id,alt_text,sort_order")
  .in("product_id", ids);

const emptyAlt = (assets || []).filter((a) => !(a.alt_text || "").trim());
const byCol = {};
for (const l of links || []) {
  byCol[l.collection_id] = (byCol[l.collection_id] || 0) + 1;
}

console.log(
  JSON.stringify(
    {
      products: products.length,
      linked: linked.size,
      unlinked: unlinked.length,
      unlinkedSample: unlinked.slice(0, 15).map((p) => p.name),
      collections: (cols || []).map((c) => ({
        slug: c.slug,
        count: byCol[c.id] || 0,
        hasSeo: Boolean((colSeo || []).find((s) => s.subject_id === c.id)?.title),
      })),
      assets: assets?.length || 0,
      emptyAlt: emptyAlt.length,
    },
    null,
    2,
  ),
);
