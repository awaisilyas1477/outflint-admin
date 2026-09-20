/**
 * Inspect seo_meta coverage for routes/policies + product field completeness.
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

const { data: all } = await sb.from("seo_meta").select("subject_type");
const counts = {};
for (const r of all || []) counts[r.subject_type] = (counts[r.subject_type] || 0) + 1;
console.log("types", counts);

const { data: routes } = await sb
  .from("seo_meta")
  .select(
    "subject_key,title,description,keywords,og_image_url,og_image_alt,twitter_card,canonical_url,noindex,nofollow,locale",
  )
  .eq("subject_type", "route");
console.log("routes", JSON.stringify(routes, null, 2));

const { data: pols } = await sb
  .from("seo_meta")
  .select("subject_id,title,description,keywords,og_image_url,og_image_alt,canonical_url")
  .eq("subject_type", "policy_page");
console.log(
  "policies",
  pols?.map((p) => ({
    title: p.title,
    descLen: (p.description || "").length,
    kw: (p.keywords || []).length,
    og: Boolean(p.og_image_url),
    alt: Boolean(p.og_image_alt),
    canon: p.canonical_url,
  })),
);

const { data: home } = await sb
  .from("seo_meta")
  .select("subject_key,subject_id,title,description,keywords,og_image_url")
  .eq("subject_type", "home_section");
console.log("home_sections", home);

const { data: allProd } = await sb
  .from("seo_meta")
  .select(
    "id,subject_id,title,description,keywords,og_image_url,og_image_alt,twitter_card,og_image_width,og_image_height,canonical_url",
  )
  .eq("subject_type", "product");
let noAlt = 0,
  noTw = 0,
  noW = 0,
  fewKw = 0,
  noPakistan = 0,
  titles = [];
for (const p of allProd || []) {
  if (!(p.og_image_alt || "").trim()) noAlt++;
  if (!(p.twitter_card || "").trim()) noTw++;
  if (!p.og_image_width) noW++;
  if (!(p.keywords || []).length || p.keywords.length < 4) fewKw++;
  if (!/pakistan|pk\b/i.test(p.title || "") && !/pakistan/i.test(p.description || "")) noPakistan++;
  titles.push(p.title);
}
console.log({
  products: allProd?.length,
  noAlt,
  noTw,
  noW,
  fewKw,
  noPakistan,
  titleSample: titles.slice(0, 10),
});

const { data: cols } = await sb
  .from("seo_meta")
  .select("subject_id,title,description,keywords,og_image_url,og_image_alt,canonical_url,twitter_card")
  .eq("subject_type", "collection");
console.log(
  "collections seo",
  cols?.map((c) => ({
    title: c.title,
    descLen: (c.description || "").length,
    kw: (c.keywords || []).length,
    og: Boolean(c.og_image_url),
    alt: Boolean(c.og_image_alt),
    tw: c.twitter_card,
    canon: c.canonical_url,
  })),
);

// policy pages ids
const { data: policyPages } = await sb.from("policy_pages").select("id,slug,title");
console.log("policy pages", policyPages);

// site default og
const { data: site } = await sb.from("seo_site").select("*").eq("id", 1).maybeSingle();
console.log("site og", site?.default_og_image_url, site?.twitter_handle, site?.organization_same_as);
