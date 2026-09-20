/**
 * Polish remaining awkward titles + fill collection SEO.
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
const origin = "https://www.simplecartstore.com";

const MANUAL = [
  {
    match: /kunststof/i,
    name: "Colorful Reusable Plastic Drinking Straws",
  },
  {
    match: /5 piece cooking utensils silicone baking heat/i,
    name: "5-Piece Silicone Baking Utensils Set",
  },
  {
    match: /double wall mug 350ml a thermal shock/i,
    name: "Double Wall Borosilicate Mug 350ml",
  },
  {
    match: /24 pcs stainless steel dining cutlery golden 24pcs/i,
    name: "24pcs Golden Stainless Steel Cutlery Set",
  },
  {
    match: /girl transparent glass heat resistant tumbler pearl/i,
    name: "Pearl Chain Glass Tumbler with Straw",
  },
];

const { data: products } = await sb.from("products").select("id,name,slug").eq("status", "active");
let n = 0;
for (const p of products) {
  const rule = MANUAL.find((m) => m.match.test(p.name));
  if (!rule) continue;
  const shortDesc = `${rule.name} — everyday essentials from SimpleCart Store. Order online with delivery across Pakistan.`;
  const seoTitle = `${rule.name} – Buy Online PK`.slice(0, 58);
  const seoDesc = `Buy ${rule.name} online at SimpleCart Store. Quality home essentials with fast delivery across Pakistan. Shop today.`.slice(
    0,
    158,
  );
  await sb
    .from("products")
    .update({ name: rule.name, short_description: shortDesc })
    .eq("id", p.id);
  const { data: seo } = await sb
    .from("seo_meta")
    .select("id")
    .eq("subject_type", "product")
    .eq("subject_id", p.id)
    .eq("locale", "en")
    .maybeSingle();
  const payload = {
    title: seoTitle,
    description: seoDesc,
    og_image_alt: rule.name,
    canonical_url: `${origin}/products/${encodeURIComponent(p.slug)}`,
  };
  if (seo?.id) await sb.from("seo_meta").update(payload).eq("id", seo.id);
  console.log(`polished: ${p.name} → ${rule.name}`);
  n++;
}

// Collection SEO
const { data: cols } = await sb.from("collections").select("id,name,slug,description");
for (const c of cols || []) {
  const desc =
    c.slug === "water-bottles"
      ? "Shop stainless steel flasks, tumblers, glass sippers and everyday water bottles at SimpleCart Store. Hot & cold bottles with delivery across Pakistan."
      : c.description ||
        `Shop ${c.name} at SimpleCart Store — quality home and kitchen essentials with delivery across Pakistan.`;
  await sb.from("collections").update({ description: desc }).eq("id", c.id);

  const title = `${c.name} | Buy Online in Pakistan`;
  const keywords = [
    c.name.toLowerCase(),
    `${c.name} Pakistan`,
    `buy ${c.name} online`,
    "SimpleCart Store",
    "online shopping Pakistan",
  ];
  const { data: existing } = await sb
    .from("seo_meta")
    .select("id")
    .eq("subject_type", "collection")
    .eq("subject_id", c.id)
    .eq("locale", "en")
    .maybeSingle();
  const payload = {
    subject_type: "collection",
    subject_id: c.id,
    locale: "en",
    title,
    description: desc,
    keywords,
    canonical_url: `${origin}/collections/${encodeURIComponent(c.slug)}`,
    twitter_card: "summary_large_image",
    noindex: false,
    nofollow: false,
  };
  if (existing?.id) await sb.from("seo_meta").update(payload).eq("id", existing.id);
  else await sb.from("seo_meta").insert(payload);
  console.log(`collection seo: ${c.slug}`);
}

// Verifications check
const { data: v } = await sb.from("seo_search_engine_verifications").select("*").eq("id", 1).maybeSingle();
console.log("verifications:", {
  google: Boolean(v?.google_site_verification),
  bing: Boolean(v?.bing_site_verification),
});
console.log(`done polish=${n}`);
