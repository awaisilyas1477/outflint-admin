/**
 * Full ads-readiness audit (excluding Meta Pixel — user will add later).
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

const report = { checks: [], warns: [], fails: [] };
const ok = (m) => report.checks.push(m);
const warn = (m) => report.warns.push(m);
const fail = (m) => report.fails.push(m);

// --- DB: analytics ---
const { data: analytics } = await sb
  .from("seo_analytics")
  .select("*")
  .eq("id", 1)
  .maybeSingle();
if (analytics?.google_analytics_id?.startsWith("G-")) ok(`GA4: ${analytics.google_analytics_id}`);
else fail("GA4 missing");
if (analytics?.google_tag_manager_id?.startsWith("GTM-"))
  ok(`GTM: ${analytics.google_tag_manager_id}`);
else warn("GTM missing");
if (!analytics?.meta_pixel_id) ok("Meta Pixel empty (deferred by user)");
if (analytics?.consent_required) warn("Consent required ON — ads pixels wait for consent");
else ok("Consent required OFF (OK for PK-focused)");

// --- store settings / NAP ---
const { data: settings } = await sb.from("store_settings").select("*").eq("id", 1).maybeSingle();
const { data: site } = await sb.from("seo_site").select("*").eq("id", 1).maybeSingle();
if (settings?.store_name) ok(`Store: ${settings.store_name}`);
if (settings?.site_description) ok("Site description set");
else warn("Site description empty");
if (settings?.support_email || site?.organization_email) ok("Support/org email present");
else warn("No support/org email");
if (settings?.footer_phone || site?.organization_phone) ok("Phone present");
else warn("No phone on store/seo_site");
if (site?.organization_logo_url || site?.default_og_image_url) ok("Logo/OG image present");
else warn("Missing org logo / default OG");
if (site?.address_country) ok(`Country: ${site.address_country}`);
else warn("No address country on seo_site");

// --- policies ---
const { data: policies } = await sb
  .from("policy_pages")
  .select("id,slug,title")
  .in("slug", ["return-policy", "shipping-policy"]);
const ret = policies?.find((p) => p.slug === "return-policy");
const ship = policies?.find((p) => p.slug === "shipping-policy");
if (ret) ok(`Return policy: ${ret.slug}`);
else fail("Return policy missing");
if (ship) ok(`Shipping policy: ${ship.slug}`);
else fail("Shipping policy missing");

// --- products ---
const { data: products } = await sb
  .from("products")
  .select("id,name,slug,status,short_description")
  .eq("status", "active");
ok(`Active products: ${products?.length || 0}`);
const noShort = (products || []).filter((p) => !(p.short_description || "").trim());
if (noShort.length) warn(`${noShort.length} products missing short_description`);
else ok("All products have short_description");

const ids = (products || []).map((p) => p.id);
const { data: seo } = await sb
  .from("seo_meta")
  .select("subject_id,title,description")
  .eq("subject_type", "product")
  .in("subject_id", ids);
const seoSet = new Set((seo || []).map((s) => s.subject_id));
const missingSeo = ids.filter((id) => !seoSet.has(id));
if (missingSeo.length) fail(`${missingSeo.length} products missing seo_meta`);
else ok("All products have seo_meta");

const { data: shop } = await sb
  .from("product_shopping_attributes")
  .select("product_id,brand_name,gtin,mpn,return_policy_id,shipping_policy_id,country_of_origin")
  .in("product_id", ids);
const shopBy = new Map((shop || []).map((s) => [s.product_id, s]));
let noShop = 0,
  noBrand = 0,
  noGtin = 0,
  noMpn = 0,
  noReturn = 0,
  noShip = 0;
for (const id of ids) {
  const s = shopBy.get(id);
  if (!s) {
    noShop++;
    continue;
  }
  if (!(s.brand_name || "").trim()) noBrand++;
  if (!(s.gtin || "").trim()) noGtin++;
  if (!(s.mpn || "").trim()) noMpn++;
  if (!s.return_policy_id) noReturn++;
  if (!s.shipping_policy_id) noShip++;
}
if (noShop) warn(`${noShop} products missing shopping_attributes`);
else ok("All products have shopping_attributes");
if (noBrand) warn(`${noBrand} products missing brand_name`);
else ok("All brands set");
if (noGtin) warn(`${noGtin}/${ids.length} products missing GTIN (use brand+MPN for Merchant)`);
if (noMpn) warn(`${noMpn} products missing MPN`);
else ok("All products have MPN (SKU fallback OK without GTIN)");
if (noReturn) warn(`${noReturn} products missing return_policy_id`);
else ok("Return policy linked on shopping attrs");
if (noShip) warn(`${noShip} products missing shipping_policy_id`);
else ok("Shipping policy linked on shopping attrs");

// duplicates by similar name
const nameMap = new Map();
for (const p of products || []) {
  const key = p.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!nameMap.has(key)) nameMap.set(key, []);
  nameMap.get(key).push(p.slug);
}
const dups = [...nameMap.entries()].filter(([, v]) => v.length > 1);
if (dups.length) warn(`${dups.length} duplicate product name groups (Shopping feed risk)`);
else ok("No exact duplicate product names");

// collections
const { data: cols } = await sb.from("collections").select("id,slug,name");
const { data: links } = await sb.from("product_collections").select("product_id").in("product_id", ids);
const linked = new Set((links || []).map((l) => l.product_id));
const unlinked = ids.filter((id) => !linked.has(id));
ok(`Collections: ${cols?.length || 0}`);
if (unlinked.length) fail(`${unlinked.length} products not in any collection`);
else ok("All products assigned to collections");

// assets alts
const { data: emptyAlt } = await sb
  .from("product_assets")
  .select("id", { count: "exact", head: true })
  .in("product_id", ids)
  .or("alt_text.eq.,alt_text.is.null");
// head+count may not work same — fallback
const { count: emptyAltCount } = await sb
  .from("product_assets")
  .select("id", { count: "exact", head: true })
  .in("product_id", ids)
  .eq("alt_text", "");
if (emptyAltCount > 0) warn(`${emptyAltCount} assets with empty alt_text`);
else ok("Product asset alts filled");

// variants/prices (no is_default column on this schema)
const { data: variants } = await sb
  .from("product_variants")
  .select("product_id,price")
  .in("product_id", ids);
const priced = new Set(
  (variants || []).filter((v) => Number(v.price) > 0).map((v) => v.product_id),
);
const noPrice = ids.filter((id) => !priced.has(id));
if (noPrice.length) fail(`${noPrice.length} products with no positive price variant`);
else ok("All products have priced variants");

// --- live HTTP ---
async function checkUrl(path, expect = 200) {
  const res = await fetch(`https://www.simplecartstore.com${path}`, {
    redirect: "manual",
    cache: "no-store",
  });
  const status = res.status;
  if (status === expect || (expect === 200 && status >= 200 && status < 400))
    ok(`HTTP ${status} ${path}`);
  else fail(`HTTP ${status} ${path} (expected ${expect})`);
  return res;
}

await checkUrl("/");
await checkUrl("/collections");
await checkUrl("/contact");
await checkUrl("/return-policy");
await checkUrl("/shipping-policy");
await checkUrl("/robots.txt");
await checkUrl("/sitemap.xml");
await checkUrl("/ads.txt");
await checkUrl("/checkout");

const home = await (await fetch("https://www.simplecartstore.com/", { cache: "no-store" })).text();
if (home.includes("G-HLEMH46BSK")) ok("Live GA4 in HTML");
else fail("Live GA4 missing from HTML");
if (home.includes("GTM-PHVL8DGG")) ok("Live GTM in HTML");
else fail("Live GTM missing from HTML");
if (/ca-pub-9696696438221700|adsbygoogle/i.test(home)) ok("AdSense loader present");
else warn("AdSense not found in homepage HTML");

const adsTxt = await (await fetch("https://www.simplecartstore.com/ads.txt", { cache: "no-store" })).text();
if (/google\.com,\s*pub-9696696438221700/i.test(adsTxt)) ok("ads.txt valid Google line");
else warn("ads.txt missing expected Google publisher line");

const robots = await (await fetch("https://www.simplecartstore.com/robots.txt", { cache: "no-store" })).text();
if (/sitemap/i.test(robots)) ok("robots.txt references sitemap");
else warn("robots.txt missing sitemap ref");

console.log(JSON.stringify(report, null, 2));
console.log(`\nSUMMARY ok=${report.checks.length} warn=${report.warns.length} fail=${report.fails.length}`);
if (dups.length) {
  console.log("\nDuplicate name groups (sample):");
  for (const [name, slugs] of dups.slice(0, 8)) {
    console.log(`- ${name} => ${slugs.join(", ")}`);
  }
}
