/**
 * Re-apply strong collection + route SEO titles after content rename.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://www.simplecartstore.com";
const DEFAULT_OG =
  "https://onmnnxcdwcuegsbvjoqa.supabase.co/storage/v1/object/public/e-commerce-store/seo/og/e72edb9a-79da-4e48-8b66-a72901846ab8.jpg";

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
function clamp(s, max) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, max - 1);
  const cut = slice.lastIndexOf(" ");
  return (cut > Math.floor(max * 0.55) ? slice.slice(0, cut) : slice).trim();
}

const e = loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);

const COL = {
  drinkware: {
    title: "Water Bottles & Tumblers in Pakistan",
    description:
      "Buy water bottles, stainless flasks, glass tumblers and sippers online in Pakistan. Hot & cold drinkware at SimpleCart Store with COD delivery.",
    keywords: [
      "water bottles Pakistan",
      "buy tumbler online",
      "stainless steel flask",
      "glass sipper Pakistan",
      "drinkware online",
      "SimpleCart Store",
    ],
  },
  kitchen: {
    title: "Kitchen Tools & Utensils in Pakistan",
    description:
      "Shop kitchen utensils, cutlery sets, choppers and grinders online in Pakistan. Practical cooking tools from SimpleCart Store with COD delivery.",
    keywords: [
      "kitchen tools Pakistan",
      "cutlery set online",
      "kitchen utensils",
      "chopper grinder",
      "SimpleCart Store",
    ],
  },
  appliances: {
    title: "Home Appliances Online Pakistan",
    description:
      "Buy electric kettles, room heaters, humidifiers and compact appliances online in Pakistan. SimpleCart Store — COD and nationwide delivery.",
    keywords: [
      "electric kettle Pakistan",
      "room heater online",
      "humidifier Pakistan",
      "home appliances",
      "SimpleCart Store",
    ],
  },
  beauty: {
    title: "Beauty Tools Online Pakistan",
    description:
      "Shop hair straighteners, dryers, wax warmers, mirrors and trimmers online in Pakistan. Beauty tools from SimpleCart Store with COD.",
    keywords: [
      "hair straightener Pakistan",
      "wax warmer online",
      "beauty tools Pakistan",
      "makeup mirror",
      "SimpleCart Store",
    ],
  },
  lighting: {
    title: "Lamps & Night Lights in Pakistan",
    description:
      "Buy crystal lamps, LED night lights and solar work lights online in Pakistan. Home lighting from SimpleCart Store with delivery.",
    keywords: [
      "LED night light Pakistan",
      "crystal lamp online",
      "solar work light",
      "table lamp Pakistan",
      "SimpleCart Store",
    ],
  },
  "pest-control": {
    title: "Mosquito Killers Online Pakistan",
    description:
      "Shop mosquito killer lamps and rechargeable rackets online in Pakistan. Home pest control at SimpleCart Store with COD delivery.",
    keywords: [
      "mosquito killer Pakistan",
      "bug zapper online",
      "mosquito racket",
      "pest control lamp",
      "SimpleCart Store",
    ],
  },
  wellness: {
    title: "Massagers & Wellness in Pakistan",
    description:
      "Buy neck massagers, foot massagers and wellness gadgets online in Pakistan. Feel-better picks from SimpleCart Store with COD.",
    keywords: [
      "neck massager Pakistan",
      "foot massager online",
      "wellness gadgets",
      "massage tool",
      "SimpleCart Store",
    ],
  },
  home: {
    title: "Home Essentials Online Pakistan",
    description:
      "Shop everyday home essentials online in Pakistan — practical finds for kitchen, room and daily life from SimpleCart Store with COD.",
    keywords: [
      "home essentials Pakistan",
      "buy home products online",
      "household gadgets",
      "SimpleCart Store",
    ],
  },
};

const { data: cols } = await sb.from("collections").select("id,slug,name,description");
for (const c of cols || []) {
  const conf = COL[c.slug];
  if (!conf) continue;
  const { data: existing } = await sb
    .from("seo_meta")
    .select("id,og_image_url")
    .eq("subject_type", "collection")
    .eq("subject_id", c.id)
    .eq("locale", "en")
    .maybeSingle();
  const payload = {
    title: clamp(conf.title, 58),
    description: clamp(conf.description, 158),
    keywords: conf.keywords,
    canonical_url: `${ORIGIN}/collections/${c.slug}`,
    og_image_url: existing?.og_image_url || DEFAULT_OG,
    og_image_alt: `${conf.title} | SimpleCart Store`,
    og_image_width: 1200,
    og_image_height: 630,
    twitter_card: "summary_large_image",
    noindex: false,
    nofollow: false,
  };
  if (existing?.id) await sb.from("seo_meta").update(payload).eq("id", existing.id);
  else
    await sb.from("seo_meta").insert({
      subject_type: "collection",
      subject_id: c.id,
      locale: "en",
      ...payload,
    });
  console.log(c.slug, "→", payload.title, "| name=", c.name);
}

// Fix site brand suffix consistency
await sb
  .from("store_settings")
  .update({ store_name: "SimpleCart Store", site_title: "SimpleCart Store" })
  .eq("id", 1);
console.log("store brand suffix fixed");
