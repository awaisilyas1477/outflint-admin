/**
 * Deep SEO gap audit: products, collections, routes, policies, shopping attrs, assets.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
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

const report = { products: {}, collections: {}, routes: {}, site: {}, shopping: {}, assets: {}, samples: {} };

// seo_meta columns sample
const { data: anySeo } = await sb.from("seo_meta").select("*").limit(1);
report.seo_meta_columns = anySeo?.[0] ? Object.keys(anySeo[0]) : [];

const { data: products } = await sb
  .from("products")
  .select("id,name,slug,short_description,description,status,tags")
  .eq("status", "active");
const pids = products.map((p) => p.id);

const { data: productSeo } = await sb
  .from("seo_meta")
  .select("*")
  .eq("subject_type", "product")
  .in("subject_id", pids);

const seoBy = new Map((productSeo || []).map((s) => [s.subject_id, s]));

const gaps = {
  no_seo_row: 0,
  no_title: 0,
  no_description: 0,
  no_keywords: 0,
  no_og_title: 0,
  no_og_description: 0,
  no_og_image: 0,
  no_canonical: 0,
  no_robots: 0,
  title_too_long: 0,
  title_too_short: 0,
  desc_too_long: 0,
  desc_too_short: 0,
  no_short_desc: 0,
  no_tags: 0,
  weak_title_generic: 0,
};
const weakSamples = [];

for (const p of products) {
  const s = seoBy.get(p.id);
  if (!s) {
    gaps.no_seo_row++;
    continue;
  }
  if (!(s.title || "").trim()) gaps.no_title++;
  if (!(s.description || "").trim()) gaps.no_description++;
  if (!Array.isArray(s.keywords) || s.keywords.length === 0) gaps.no_keywords++;
  if (!(s.og_title || "").trim()) gaps.no_og_title++;
  if (!(s.og_description || "").trim()) gaps.no_og_description++;
  if (!(s.og_image_url || "").trim()) gaps.no_og_image++;
  if (!(s.canonical_url || "").trim()) gaps.no_canonical++;
  if (!(s.robots || "").trim()) gaps.no_robots++;
  const tl = (s.title || "").trim().length;
  const dl = (s.description || "").trim().length;
  if (tl > 60) gaps.title_too_long++;
  if (tl > 0 && tl < 25) gaps.title_too_short++;
  if (dl > 160) gaps.desc_too_long++;
  if (dl > 0 && dl < 70) gaps.desc_too_short++;
  if (!(p.short_description || "").trim()) gaps.no_short_desc++;
  if (!Array.isArray(p.tags) || p.tags.length === 0) gaps.no_tags++;
  const title = (s.title || "").toLowerCase();
  if (/buy online|best price|shop now|click here/.test(title) || title === p.name.toLowerCase()) {
    gaps.weak_title_generic++;
  }
  if (
    !(s.og_image_url || "").trim() ||
    !(s.keywords || []).length ||
    dl < 70 ||
    tl > 60
  ) {
    if (weakSamples.length < 8) {
      weakSamples.push({
        slug: p.slug,
        title: s.title,
        titleLen: tl,
        descLen: dl,
        kw: (s.keywords || []).length,
        ogImg: Boolean((s.og_image_url || "").trim()),
        ogTitle: Boolean((s.og_title || "").trim()),
        robots: s.robots,
        canonical: Boolean((s.canonical_url || "").trim()),
      });
    }
  }
}
report.products = { count: products.length, gaps, weakSamples };

// collections
const { data: cols } = await sb.from("collections").select("id,name,slug,description");
const cids = (cols || []).map((c) => c.id);
const { data: colSeo } = await sb
  .from("seo_meta")
  .select("*")
  .eq("subject_type", "collection")
  .in("subject_id", cids);
const colBy = new Map((colSeo || []).map((s) => [s.subject_id, s]));
const colGaps = {
  no_seo: 0,
  no_title: 0,
  no_desc: 0,
  no_kw: 0,
  no_og_img: 0,
  no_collection_desc: 0,
  title_long: 0,
};
const colSamples = [];
for (const c of cols || []) {
  const s = colBy.get(c.id);
  if (!s) {
    colGaps.no_seo++;
    continue;
  }
  if (!(s.title || "").trim()) colGaps.no_title++;
  if (!(s.description || "").trim()) colGaps.no_desc++;
  if (!Array.isArray(s.keywords) || !s.keywords.length) colGaps.no_kw++;
  if (!(s.og_image_url || "").trim()) colGaps.no_og_img++;
  if (!(c.description || "").trim()) colGaps.no_collection_desc++;
  if ((s.title || "").length > 60) colGaps.title_long++;
  colSamples.push({
    slug: c.slug,
    title: s.title,
    titleLen: (s.title || "").length,
    descLen: (s.description || "").length,
    kw: (s.keywords || []).length,
    bodyDesc: Boolean((c.description || "").trim()),
    ogImg: Boolean((s.og_image_url || "").trim()),
  });
}
report.collections = { count: cols?.length || 0, colGaps, colSamples };

// routes / policies / home sections
const { data: routes } = await sb
  .from("seo_meta")
  .select("subject_type,subject_key,subject_id,title,description,keywords,og_image_url,canonical_url,robots")
  .in("subject_type", ["route", "policy_page", "home_section"]);
report.routes = {
  count: routes?.length || 0,
  byType: {},
  rows: (routes || []).map((r) => ({
    type: r.subject_type,
    key: r.subject_key || r.subject_id,
    title: r.title,
    titleLen: (r.title || "").length,
    descLen: (r.description || "").length,
    kw: (r.keywords || []).length,
    ogImg: Boolean(r.og_image_url),
    robots: r.robots,
  })),
};
for (const r of routes || []) {
  report.routes.byType[r.subject_type] = (report.routes.byType[r.subject_type] || 0) + 1;
}

const { data: site } = await sb.from("seo_site").select("*").eq("id", 1).maybeSingle();
const { data: settings } = await sb.from("store_settings").select("*").eq("id", 1).maybeSingle();
report.site = {
  seo_site: site
    ? {
        org: site.organization_legal_name,
        phone: site.organization_phone,
        email: site.organization_email,
        logo: Boolean(site.organization_logo_url),
        og: Boolean(site.default_og_image_url),
        ogAlt: site.default_og_image_alt,
        city: site.address_city,
        country: site.address_country,
        locale: site.locale,
        street: Boolean(site.address_street),
      }
    : null,
  store: settings
    ? {
        name: settings.store_name,
        descLen: (settings.site_description || "").length,
        desc: (settings.site_description || "").slice(0, 180),
      }
    : null,
};

const { data: shop } = await sb
  .from("product_shopping_attributes")
  .select("product_id,brand_name,gtin,mpn,country_of_origin,material,return_policy_id,shipping_policy_id")
  .in("product_id", pids);
let shopGaps = { no_brand: 0, no_mpn: 0, no_origin: 0, no_material: 0 };
for (const s of shop || []) {
  if (!(s.brand_name || "").trim()) shopGaps.no_brand++;
  if (!(s.mpn || "").trim()) shopGaps.no_mpn++;
  if (!(s.country_of_origin || "").trim()) shopGaps.no_origin++;
  if (!(s.material || "").trim()) shopGaps.no_material++;
}
report.shopping = { count: shop?.length || 0, shopGaps };

const { count: emptyAlt } = await sb
  .from("product_assets")
  .select("id", { count: "exact", head: true })
  .in("product_id", pids)
  .or("alt_text.is.null,alt_text.eq.");
report.assets = { emptyAlt };

// title length distribution
const titleLens = (productSeo || []).map((s) => (s.title || "").length).sort((a, b) => a - b);
report.products.titleStats = {
  min: titleLens[0],
  max: titleLens[titleLens.length - 1],
  avg: Math.round(titleLens.reduce((a, b) => a + b, 0) / titleLens.length),
  p50: titleLens[Math.floor(titleLens.length / 2)],
};
const descLens = (productSeo || []).map((s) => (s.description || "").length).sort((a, b) => a - b);
report.products.descStats = {
  min: descLens[0],
  max: descLens[descLens.length - 1],
  avg: Math.round(descLens.reduce((a, b) => a + b, 0) / descLens.length),
};

writeFileSync(resolve(root, "scripts/.seo-gap-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
