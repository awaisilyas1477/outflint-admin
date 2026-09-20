/**
 * Strengthen collection SEO + fill missing image alts from product names.
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
const origin = "https://www.simplecartstore.com";

const COL_SEO = {
  "drinkware-tumblers": {
    title: "Drinkware & Tumblers in Pakistan",
    description:
      "Buy water bottles, flasks, glass tumblers and sippers online in Pakistan. Hot & cold drinkware at SimpleCart Store with COD and nationwide delivery.",
    keywords: [
      "water bottles Pakistan",
      "buy tumbler online",
      "stainless steel flask",
      "glass sipper",
      "drinkware Pakistan",
      "SimpleCart Store",
    ],
  },
  "kitchen-essentials": {
    title: "Kitchen Essentials in Pakistan",
    description:
      "Shop kitchen utensils, cutlery sets, choppers and grinders online in Pakistan. Practical cooking tools from SimpleCart Store with COD delivery.",
    keywords: [
      "kitchen tools Pakistan",
      "cutlery set",
      "chopper",
      "kitchen utensils online",
      "SimpleCart Store",
    ],
  },
  "home-appliances": {
    title: "Home Appliances in Pakistan",
    description:
      "Buy electric kettles, room heaters, humidifiers and compact appliances online in Pakistan. SimpleCart Store — COD and nationwide delivery.",
    keywords: [
      "electric kettle Pakistan",
      "room heater",
      "humidifier",
      "home appliances online",
      "SimpleCart Store",
    ],
  },
  "beauty-personal-care": {
    title: "Beauty & Personal Care in Pakistan",
    description:
      "Shop hair straighteners, dryers, wax warmers, mirrors and trimmers online in Pakistan. Beauty tools from SimpleCart Store with COD.",
    keywords: [
      "hair straightener Pakistan",
      "wax warmer",
      "beauty tools online",
      "makeup mirror",
      "SimpleCart Store",
    ],
  },
  "lamps-lighting": {
    title: "Lamps & Lighting in Pakistan",
    description:
      "Buy crystal lamps, LED night lights and solar work lights online in Pakistan. Home lighting from SimpleCart Store with delivery.",
    keywords: [
      "LED night light Pakistan",
      "crystal lamp",
      "solar light",
      "table lamp online",
      "SimpleCart Store",
    ],
  },
  "pest-control": {
    title: "Mosquito Killers & Pest Control",
    description:
      "Shop mosquito killer lamps and rechargeable rackets online in Pakistan. Home pest control at SimpleCart Store with COD.",
    keywords: [
      "mosquito killer Pakistan",
      "bug zapper",
      "mosquito racket",
      "pest control lamp",
      "SimpleCart Store",
    ],
  },
  "wellness-comfort": {
    title: "Wellness & Comfort in Pakistan",
    description:
      "Buy neck massagers, body massagers and period relief belts online in Pakistan. Wellness essentials from SimpleCart Store.",
    keywords: [
      "neck massager Pakistan",
      "body massager",
      "period relief belt",
      "wellness products",
      "SimpleCart Store",
    ],
  },
  "home-essentials": {
    title: "Home Essentials in Pakistan",
    description:
      "Shop clocks, organizers and everyday home essentials online in Pakistan at SimpleCart Store — COD and nationwide delivery.",
    keywords: [
      "home essentials Pakistan",
      "alarm clock",
      "home organizers",
      "SimpleCart Store",
    ],
  },
};

const { data: cols } = await sb.from("collections").select("id,slug,name,description");
for (const c of cols || []) {
  const conf = COL_SEO[c.slug];
  if (!conf) continue;
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
    title: conf.title,
    description: conf.description,
    keywords: conf.keywords,
    canonical_url: `${origin}/collections/${c.slug}`,
    twitter_card: "summary_large_image",
    noindex: false,
    nofollow: false,
    updated_at: new Date().toISOString(),
  };
  if (existing?.id) await sb.from("seo_meta").update(payload).eq("id", existing.id);
  else await sb.from("seo_meta").insert(payload);

  // SEO meta only — keep collections.description as clean UI copy from admin/organize script.
  await sb
    .from("collections")
    .update({ name: conf.title.replace(/\s+in\s+Pakistan$/i, ""), updated_at: new Date().toISOString() })
    .eq("id", c.id);
  console.log("collection seo:", c.slug);
}

// Fill ALL asset alts from product name (overwrite weak/empty)
const { data: products } = await sb.from("products").select("id,name").eq("status", "active");
const nameById = new Map((products || []).map((p) => [p.id, p.name]));
const { data: assets } = await sb
  .from("product_assets")
  .select("id,product_id,alt_text,sort_order,kind")
  .in(
    "product_id",
    products.map((p) => p.id),
  );

let updated = 0;
for (const a of assets || []) {
  const name = nameById.get(a.product_id);
  if (!name) continue;
  const n = (a.sort_order ?? 0) + 1;
  const desired =
    a.kind === "video" ? `${name} — product video` : `${name} — product photo ${n}`;
  if ((a.alt_text || "").trim() === desired) continue;
  const { error } = await sb.from("product_assets").update({ alt_text: desired }).eq("id", a.id);
  if (error) throw error;
  updated++;
}
console.log("alts updated:", updated);
