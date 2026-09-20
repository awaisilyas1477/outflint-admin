/**
 * Quick SEO audit for SimpleCartStore products + site defaults.
 * Usage: node scripts/audit-seo.mjs
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

const storefrontEnv = loadEnvFile(
  resolve(root, "../../w-cartstore-web/e-commerce-website/.env"),
);
const adminEnv = loadEnvFile(resolve(root, ".env"));
const url = storefrontEnv.NEXT_PUBLIC_SUPABASE_URL || adminEnv.VITE_SUPABASE_URL?.trim();
const serviceKey = storefrontEnv.SUPABASE_SERVICE_ROLE_KEY;

const sb = createClient(url, serviceKey);

const { data: products, error } = await sb
  .from("products")
  .select("id,name,slug,short_description,status,tags")
  .eq("status", "active")
  .order("created_at", { ascending: false });
if (error) throw error;

const ids = products.map((p) => p.id);
const { data: seo } = await sb
  .from("seo_meta")
  .select("subject_id,title,description,keywords,canonical_url,og_image_url")
  .eq("subject_type", "product")
  .in("subject_id", ids);

const seoById = new Map((seo || []).map((s) => [s.subject_id, s]));
const { data: settings } = await sb.from("store_settings").select("*").limit(1).maybeSingle();
const { data: siteSeo } = await sb.from("seo_site").select("*").limit(1).maybeSingle();
const { data: routeSeo } = await sb
  .from("seo_meta")
  .select("subject_key,title,description,keywords")
  .eq("subject_type", "route");

const missingSeo = products.filter((p) => !seoById.has(p.id));
const longNames = [...products].sort((a, b) => b.name.length - a.name.length).slice(0, 15);
const weakSeo = products
  .map((p) => {
    const s = seoById.get(p.id);
    if (!s) return { id: p.id, name: p.name, reason: "missing" };
    const reasons = [];
    if (!s.title) reasons.push("no title");
    if (!s.description) reasons.push("no description");
    if (!s.keywords?.length) reasons.push("no keywords");
    if ((s.title || "").length > 65) reasons.push(`title ${s.title.length}`);
    if ((s.description || "").length > 165) reasons.push(`desc ${s.description.length}`);
    if ((s.title || "").includes("…")) reasons.push("truncated title");
    return reasons.length ? { id: p.id, name: p.name.slice(0, 60), reasons } : null;
  })
  .filter(Boolean);

console.log(
  JSON.stringify(
    {
      productCount: products.length,
      seoCount: seo?.length || 0,
      missingSeo: missingSeo.length,
      weakSeoCount: weakSeo.length,
      avgNameLen: Math.round(
        products.reduce((a, p) => a + p.name.length, 0) / Math.max(products.length, 1),
      ),
      longestNames: longNames.map((p) => ({ len: p.name.length, name: p.name })),
      weakSeoSample: weakSeo.slice(0, 12),
      settings: settings
        ? {
            store_name: settings.store_name,
            site_title: settings.site_title,
            site_description: settings.site_description,
          }
        : null,
      siteSeo: siteSeo
        ? {
            organization_name: siteSeo.organization_name,
            default_og_image_url: siteSeo.default_og_image_url,
            locale: siteSeo.locale,
          }
        : null,
      routeSeo: routeSeo || [],
    },
    null,
    2,
  ),
);
