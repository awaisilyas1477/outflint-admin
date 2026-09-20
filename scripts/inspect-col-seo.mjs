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
const { data: cols } = await sb
  .from("collections")
  .select("id,slug,name,description,hero_image");
const ids = cols.map((c) => c.id);
const { data: seo } = await sb
  .from("seo_meta")
  .select("subject_id,title,description,keywords")
  .eq("subject_type", "collection")
  .in("subject_id", ids);
const { data: empty } = await sb
  .from("product_assets")
  .select("id,product_id,alt_text,sort_order")
  .or("alt_text.eq.,alt_text.is.null");
console.log(
  JSON.stringify(
    {
      cols: cols.map((c) => ({
        slug: c.slug,
        name: c.name,
        seo: (seo || []).find((s) => s.subject_id === c.id),
      })),
      emptyAltCount: empty?.length || 0,
      emptySample: (empty || []).slice(0, 5),
    },
    null,
    2,
  ),
);
