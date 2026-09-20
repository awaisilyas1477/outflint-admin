/**
 * Strengthen all SEO fields: fill gaps + upgrade weak copy.
 * Safe: does not change product slugs or names unless awkward policy titles.
 *
 * Usage: node scripts/strengthen-seo-all.mjs [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");
const ORIGIN = "https://www.simplecartstore.com";
const BRAND = "SimpleCart Store";
const DEFAULT_OG =
  "https://onmnnxcdwcuegsbvjoqa.supabase.co/storage/v1/object/public/e-commerce-store/seo/og/e72edb9a-79da-4e48-8b66-a72901846ab8.jpg";
const DEFAULT_OG_ALT =
  "SimpleCart Store — drinkware, kitchen tools and beauty essentials online in Pakistan";

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

function uniq(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const t = String(x || "").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

const e = loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);

const stats = {
  products: 0,
  collections: 0,
  routes: 0,
  policies: 0,
  materials: 0,
  site: 0,
  store: 0,
};

async function upsertSeo(payload, existingId) {
  if (DRY) return;
  if (existingId) {
    const { error } = await sb.from("seo_meta").update(payload).eq("id", existingId);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await sb.from("seo_meta").upsert(
    { ...payload, locale: payload.locale || "en" },
    { onConflict: "subject_type,subject_id,locale" },
  );
  if (error) {
    // route rows use subject_key
    const { error: e2 } = await sb.from("seo_meta").upsert(
      { ...payload, locale: payload.locale || "en" },
      { onConflict: "subject_type,subject_key,locale" },
    );
    if (e2) throw new Error(e2.message);
  }
}

// ---------------------------------------------------------------------------
// 1) Site identity + store settings
// ---------------------------------------------------------------------------
const sitePatch = {
  organization_legal_name: BRAND,
  organization_phone: "+923009761427",
  organization_email: "support@scs.com",
  default_og_image_url: DEFAULT_OG,
  default_og_image_alt: DEFAULT_OG_ALT,
  locale: "en_PK",
  address_country: "PK",
  address_city: "Lahore",
};
const storePatch = {
  store_name: BRAND,
  site_title: BRAND,
  site_description: clamp(
    "Shop water bottles, tumblers, kitchen tools, beauty gadgets and home essentials online in Pakistan. Fair PKR prices, COD, and nationwide delivery from SimpleCart Store.",
    158,
  ),
};

if (!DRY) {
  await sb.from("seo_site").update(sitePatch).eq("id", 1);
  await sb.from("store_settings").update(storePatch).eq("id", 1);
}
stats.site = 1;
stats.store = 1;

// ---------------------------------------------------------------------------
// 2) Routes — strongest commercial local SEO + www canonicals
// ---------------------------------------------------------------------------
const ROUTES = [
  {
    key: "/",
    title: "Buy Home Essentials Online Pakistan",
    description:
      "Shop drinkware, kitchen tools, beauty gadgets and home appliances at SimpleCart Store. Fair PKR prices, cash on delivery, and nationwide delivery across Pakistan.",
    keywords: [
      "online shopping Pakistan",
      "home essentials Pakistan",
      "buy water bottles online",
      "kitchen tools Pakistan",
      "beauty gadgets online",
      "cash on delivery Pakistan",
      "SimpleCart Store",
    ],
    noindex: false,
  },
  {
    key: "/collections",
    title: "Shop All Collections Pakistan",
    description:
      "Browse drinkware, kitchen, appliances, beauty, lighting and home essentials. Curated picks with COD and delivery across Pakistan from SimpleCart Store.",
    keywords: [
      "shop collections Pakistan",
      "drinkware Pakistan",
      "kitchen tools online",
      "home appliances Pakistan",
      "beauty tools online",
      "SimpleCart Store",
    ],
    noindex: false,
  },
  {
    key: "/collections/sale",
    title: "Sale Collection Pakistan",
    description:
      "Browse discounted drinkware, kitchen and beauty essentials at SimpleCart Store. Sale picks with cash on delivery across Pakistan.",
    keywords: ["sale collection Pakistan", "discounted products", "COD deals", "SimpleCart Store"],
    noindex: false,
  },
  {
    key: "/sale",
    title: "Sale & Deals Pakistan",
    description:
      "Shop current deals on home, kitchen and beauty essentials at SimpleCart Store. Discounted picks with COD available nationwide.",
    keywords: ["sale Pakistan", "home deals", "kitchen discount", "SimpleCart Store"],
    noindex: false,
  },
  {
    key: "/contact",
    title: "Contact SimpleCart Store",
    description:
      "Contact SimpleCart Store for order help, shipping questions or product advice. WhatsApp and email support for shoppers across Pakistan.",
    keywords: [
      "contact SimpleCart Store",
      "customer support Pakistan",
      "WhatsApp order help",
      "shipping questions",
    ],
    noindex: false,
  },
  {
    key: "/search",
    title: "Search Products Pakistan",
    description:
      "Search SimpleCart Store for bottles, kitchen tools, beauty devices and home essentials. Fast results with delivery across Pakistan.",
    keywords: ["search products Pakistan", "find home essentials", "SimpleCart Store"],
    noindex: true, // search SERPs usually shouldn't compete
  },
  {
    key: "/bundles",
    title: "Product Bundles Pakistan",
    description:
      "Explore value bundles and multi-item offers at SimpleCart Store. Save on home and kitchen essentials with COD delivery.",
    keywords: ["product bundles Pakistan", "combo deals", "SimpleCart Store"],
    noindex: false,
  },
  {
    key: "/policies",
    title: "Store Policies Pakistan",
    description:
      "Read SimpleCart Store shipping, returns and shopping policies. Clear rules for cash-on-delivery orders across Pakistan.",
    keywords: ["shipping policy", "return policy Pakistan", "SimpleCart Store policies"],
    noindex: false,
  },
  {
    key: "/checkout",
    title: "Checkout",
    description: "Complete your SimpleCart Store order with cash on delivery across Pakistan.",
    keywords: ["checkout", "cash on delivery"],
    noindex: true,
  },
  {
    key: "/login",
    title: "Log In",
    description: "Sign in to your SimpleCart Store account to track orders and manage your profile.",
    keywords: ["login", "SimpleCart Store account"],
    noindex: true,
  },
  {
    key: "/signup",
    title: "Create Account",
    description: "Create a SimpleCart Store account for faster checkout and order history in Pakistan.",
    keywords: ["sign up", "create account", "SimpleCart Store"],
    noindex: true,
  },
];

const { data: routeRows } = await sb
  .from("seo_meta")
  .select("id,subject_key")
  .eq("subject_type", "route")
  .eq("locale", "en");
const routeByKey = new Map((routeRows || []).map((r) => [r.subject_key, r.id]));

for (const r of ROUTES) {
  const canonical =
    r.key === "/"
      ? `${ORIGIN}/`
      : r.noindex
        ? ""
        : `${ORIGIN}${r.key}`;
  const payload = {
    subject_type: "route",
    subject_id: null,
    subject_key: r.key,
    locale: "en",
    title: clamp(r.title, 58),
    description: clamp(r.description, 158),
    keywords: r.keywords,
    canonical_url: canonical,
    og_image_url: DEFAULT_OG,
    og_image_alt: DEFAULT_OG_ALT,
    og_image_width: 1200,
    og_image_height: 630,
    twitter_card: "summary_large_image",
    noindex: Boolean(r.noindex),
    nofollow: false,
  };
  if (DRY) {
    console.log("route", r.key, payload.title);
  } else if (routeByKey.has(r.key)) {
    const { error } = await sb.from("seo_meta").update(payload).eq("id", routeByKey.get(r.key));
    if (error) throw new Error(`route ${r.key}: ${error.message}`);
  } else {
    const { error } = await sb.from("seo_meta").insert(payload);
    if (error) throw new Error(`route insert ${r.key}: ${error.message}`);
  }
  stats.routes++;
}

// ---------------------------------------------------------------------------
// 3) Policy pages — fix wrong shipping title + fill OG/canonical
// ---------------------------------------------------------------------------
const { data: policyPages } = await sb.from("policy_pages").select("id,slug,title");
const POLICY_SEO = {
  "shipping-policy": {
    title: "Shipping Policy Pakistan",
    description:
      "Learn SimpleCart Store shipping times, delivery fees and tracking for cash-on-delivery orders across Pakistan. Packed in 1–2 business days.",
    keywords: [
      "shipping policy Pakistan",
      "delivery times",
      "COD shipping",
      "order tracking",
      "SimpleCart Store",
    ],
  },
  "return-policy": {
    title: "Return & Refund Policy",
    description:
      "Read SimpleCart Store returns and refunds rules. Contact us within 7 days for damaged or incorrect items on COD orders across Pakistan.",
    keywords: [
      "return policy Pakistan",
      "refund policy",
      "exchange policy",
      "COD returns",
      "SimpleCart Store",
    ],
  },
};

for (const p of policyPages || []) {
  const conf = POLICY_SEO[p.slug];
  if (!conf) continue;
  const { data: existing } = await sb
    .from("seo_meta")
    .select("id")
    .eq("subject_type", "policy_page")
    .eq("subject_id", p.id)
    .eq("locale", "en")
    .maybeSingle();
  const payload = {
    subject_type: "policy_page",
    subject_id: p.id,
    subject_key: null,
    locale: "en",
    title: clamp(conf.title, 58),
    description: clamp(conf.description, 158),
    keywords: conf.keywords,
    canonical_url: `${ORIGIN}/${p.slug}`,
    og_image_url: DEFAULT_OG,
    og_image_alt: `${conf.title} | ${BRAND}`,
    og_image_width: 1200,
    og_image_height: 630,
    twitter_card: "summary_large_image",
    noindex: false,
    nofollow: false,
  };
  if (!DRY) {
    if (existing?.id) {
      const { error } = await sb.from("seo_meta").update(payload).eq("id", existing.id);
      if (error) throw new Error(`policy ${p.slug}: ${error.message}`);
    } else {
      const { error } = await sb.from("seo_meta").insert(payload);
      if (error) throw new Error(`policy insert ${p.slug}: ${error.message}`);
    }
  }
  stats.policies++;
  console.log("policy", p.slug, "→", payload.title);
}

// ---------------------------------------------------------------------------
// 4) Collections — strong titles + OG from first product image
// ---------------------------------------------------------------------------
const COL_SEO = {
  drinkware: {
    title: "Water Bottles & Tumblers in Pakistan",
    h1ish: "Water Bottles, Flasks & Tumblers",
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
    body:
      "Shop stainless steel flasks, tumblers, glass sippers and everyday water bottles at SimpleCart Store. Hot & cold drinkware with cash on delivery across Pakistan.",
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
    body:
      "Find everyday kitchen tools, cutlery and prep gadgets at SimpleCart Store. Quality cooking essentials with nationwide COD delivery in Pakistan.",
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
    body:
      "Compact home appliances for everyday comfort — kettles, heaters and more from SimpleCart Store with cash on delivery across Pakistan.",
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
    body:
      "Beauty and personal care tools for home use — straighteners, dryers, mirrors and more at SimpleCart Store with COD across Pakistan.",
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
    body:
      "Ambient lamps, night lights and practical work lights for home and outdoor use. Shop lighting at SimpleCart Store with delivery in Pakistan.",
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
    body:
      "Mosquito killer lamps and rackets for safer evenings at home. Order pest-control essentials from SimpleCart Store with COD in Pakistan.",
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
    body:
      "Massage and wellness gadgets for daily relief. Shop comfort essentials at SimpleCart Store with nationwide COD delivery.",
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
    body:
      "Everyday home essentials and household gadgets for Pakistan homes. Browse SimpleCart Store with cash on delivery nationwide.",
  },
};

const { data: cols } = await sb.from("collections").select("id,name,slug,description");
const { data: colLinks } = await sb.from("product_collections").select("collection_id,product_id");
const { data: assets } = await sb
  .from("product_assets")
  .select("product_id,url,sort_order")
  .order("sort_order", { ascending: true });
const firstAsset = new Map();
for (const a of assets || []) {
  if (!firstAsset.has(a.product_id) && a.url) firstAsset.set(a.product_id, a.url);
}
const productsByCol = new Map();
for (const l of colLinks || []) {
  if (!productsByCol.has(l.collection_id)) productsByCol.set(l.collection_id, []);
  productsByCol.get(l.collection_id).push(l.product_id);
}

for (const c of cols || []) {
  const conf = COL_SEO[c.slug] || {
    title: `${c.name} Pakistan`,
    description: `Shop ${c.name} online in Pakistan at SimpleCart Store. Quality picks with cash on delivery and nationwide shipping.`,
    keywords: [`${c.name} Pakistan`, `buy ${c.name} online`, BRAND],
    body: `Shop ${c.name} at SimpleCart Store — quality essentials with delivery across Pakistan.`,
  };
  const pids = productsByCol.get(c.id) || [];
  let og = DEFAULT_OG;
  for (const pid of pids) {
    if (firstAsset.has(pid)) {
      og = firstAsset.get(pid);
      break;
    }
  }
  if (!DRY) {
    await sb.from("collections").update({ description: conf.body }).eq("id", c.id);
  }
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
    subject_key: null,
    locale: "en",
    title: clamp(conf.title, 58),
    description: clamp(conf.description, 158),
    keywords: conf.keywords,
    canonical_url: `${ORIGIN}/collections/${c.slug}`,
    og_image_url: og,
    og_image_alt: `${conf.title} | ${BRAND}`,
    og_image_width: 1200,
    og_image_height: 630,
    twitter_card: "summary_large_image",
    noindex: false,
    nofollow: false,
  };
  if (!DRY) {
    if (existing?.id) {
      const { error } = await sb.from("seo_meta").update(payload).eq("id", existing.id);
      if (error) throw new Error(`col ${c.slug}: ${error.message}`);
    } else {
      const { error } = await sb.from("seo_meta").insert(payload);
      if (error) throw new Error(`col insert ${c.slug}: ${error.message}`);
    }
  }
  stats.collections++;
  console.log("collection", c.slug, "→", payload.title);
}

// ---------------------------------------------------------------------------
// 5) Products — fill OG dims, strengthen desc/keywords, ensure alt/canonical
// ---------------------------------------------------------------------------
function inferMaterial(name) {
  const n = name.toLowerCase();
  if (/stainless|steel|vacuum/.test(n)) return "Stainless steel";
  if (/borosilicate|glass/.test(n)) return "Glass";
  if (/silicone/.test(n)) return "Silicone";
  if (/plastic|abs|pp\b|kunststof/.test(n)) return "Plastic";
  if (/ceramic/.test(n)) return "Ceramic";
  if (/cotton|fabric|textile/.test(n)) return "Fabric";
  if (/wood|bamboo/.test(n)) return "Wood";
  if (/aluminum|aluminium/.test(n)) return "Aluminum";
  if (/copper/.test(n)) return "Copper";
  return "";
}

function strengthenProductDesc(name, existing) {
  const base = (existing || "").trim();
  // Keep good lengths; upgrade if missing COD / buy intent
  if (base.length >= 120 && /pakistan/i.test(base) && /cod|cash on delivery|delivery/i.test(base)) {
    return clamp(base, 158);
  }
  return clamp(
    `Buy ${name} online at SimpleCart Store. Quality home essential with fair PKR pricing, cash on delivery, and shipping across Pakistan.`,
    158,
  );
}

function strengthenKeywords(name, existing, collectionHint) {
  const tokens = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
  const base = [
    ...(Array.isArray(existing) ? existing : []),
    `${name} Pakistan`,
    `buy ${name} online`,
    "cash on delivery Pakistan",
    "online shopping Pakistan",
    BRAND,
    collectionHint,
    ...tokens.slice(0, 5),
  ];
  return uniq(base).slice(0, 12);
}

const { data: products } = await sb
  .from("products")
  .select("id,name,slug,short_description,tags")
  .eq("status", "active");
const pids = products.map((p) => p.id);
const { data: productSeo } = await sb
  .from("seo_meta")
  .select("*")
  .eq("subject_type", "product")
  .in("subject_id", pids);
const seoByPid = new Map((productSeo || []).map((s) => [s.subject_id, s]));

// collection hint per product
const { data: colsAll } = await sb.from("collections").select("id,slug,name");
const colNameById = new Map((colsAll || []).map((c) => [c.id, c.name]));
const colHintByPid = new Map();
for (const l of colLinks || []) {
  if (!colHintByPid.has(l.product_id)) {
    colHintByPid.set(l.product_id, colNameById.get(l.collection_id) || "");
  }
}

const { data: shopRows } = await sb
  .from("product_shopping_attributes")
  .select("product_id,material")
  .in("product_id", pids);
const shopBy = new Map((shopRows || []).map((s) => [s.product_id, s]));

for (const p of products) {
  const s = seoByPid.get(p.id);
  const ogUrl = (s?.og_image_url || "").trim() || firstAsset.get(p.id) || DEFAULT_OG;
  const rawTitle = (s?.title || "").trim() || `${p.name} in Pakistan`;
  // Upgrade generic batch titles ("… – Buy Online PK") to local commercial intent
  const needsTitleUpgrade =
    /buy online|best price|shop now|click here/i.test(rawTitle) ||
    rawTitle.toLowerCase() === p.name.toLowerCase();
  const title = clamp(
    needsTitleUpgrade
      ? `${p.name} in Pakistan`
      : /pakistan|pk\b/i.test(rawTitle)
        ? rawTitle
        : `${p.name} in Pakistan`,
    58,
  );
  const strongTitle = title;
  const description = strengthenProductDesc(p.name, s?.description);
  const keywords = strengthenKeywords(p.name, s?.keywords, colHintByPid.get(p.id));
  const shortDesc =
    (p.short_description || "").trim().length >= 60
      ? p.short_description
      : clamp(
          `${p.name} — everyday essential from SimpleCart Store. Order online with cash on delivery across Pakistan.`,
          180,
        );
  const tags = uniq([
    ...(Array.isArray(p.tags) ? p.tags : []),
    "pakistan",
    "home",
    "cod",
    ...(colHintByPid.get(p.id) ? [colHintByPid.get(p.id).toLowerCase()] : []),
  ]).slice(0, 12);

  const payload = {
    subject_type: "product",
    subject_id: p.id,
    subject_key: null,
    locale: "en",
    title: strongTitle,
    description,
    keywords,
    canonical_url: `${ORIGIN}/products/${encodeURIComponent(p.slug)}`,
    og_image_url: ogUrl,
    og_image_alt: p.name,
    og_image_width: 1200,
    og_image_height: 630,
    twitter_card: "summary_large_image",
    noindex: false,
    nofollow: false,
  };

  if (!DRY) {
    await sb
      .from("products")
      .update({ short_description: shortDesc, tags })
      .eq("id", p.id);
    if (s?.id) {
      const { error } = await sb.from("seo_meta").update(payload).eq("id", s.id);
      if (error) throw new Error(`product seo ${p.slug}: ${error.message}`);
    } else {
      const { error } = await sb.from("seo_meta").insert(payload);
      if (error) throw new Error(`product seo insert ${p.slug}: ${error.message}`);
    }

    const material = inferMaterial(p.name);
    const shop = shopBy.get(p.id);
    if (material && shop && !(shop.material || "").trim()) {
      await sb
        .from("product_shopping_attributes")
        .update({ material })
        .eq("product_id", p.id);
      stats.materials++;
    }
  }
  stats.products++;
}

writeFileSync(
  resolve(root, "scripts/.seo-strengthen-report.json"),
  JSON.stringify({ dry: DRY, stats }, null, 2),
);
console.log(JSON.stringify({ dry: DRY, stats }, null, 2));
