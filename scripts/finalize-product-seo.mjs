/**
 * End-to-end SEO finalize for SimpleCartStore:
 * - Shorten product display names
 * - Rewrite seo_meta (title, description, keywords)
 * - Strengthen short_description + tags
 * - Fix site-wide route SEO + store_settings for home/kitchen niche
 *
 * Does NOT change product slugs (URL stability).
 *
 * Usage: node scripts/finalize-product-seo.mjs [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const DRY = process.argv.includes("--dry-run");

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
const origin = (
  adminEnv.VITE_STOREFRONT_ORIGIN ||
  storefrontEnv.NEXT_PUBLIC_SITE_URL ||
  "https://www.simplecartstore.com"
)
  .trim()
  .replace(/\/$/, "");

if (!url || !serviceKey) {
  console.error("Missing Supabase URL or service role key.");
  process.exit(1);
}

const sb = createClient(url, serviceKey);
const BRAND = "SimpleCart Store";
const NAME_MAX = 52;
const SEO_TITLE_MAX = 58;
const SEO_DESC_MAX = 158;

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "your",
  "our",
  "into",
  "onto",
  "over",
  "under",
  "best",
  "high",
  "quality",
  "imported",
  "improted",
  "new",
  "cute",
  "lovely",
  "elegant",
  "premium",
  "perfect",
  "great",
  "easy",
  "use",
  "uses",
  "using",
  "can",
  "etc",
  "etc.",
  "do",
  "not",
  "collide",
  "hard",
  "material",
  "made",
  "more",
  "buy",
  "shop",
  "online",
  "pakistan",
  "pk",
  "gift",
  "gifts",
  "college",
  "girls",
  "teen",
  "hoho",
  "mugs",
  "randomly",
  "colour",
  "color",
  "will",
  "be",
  "sent",
  "available",
  "multicolor",
  "model",
  "design",
  "beautiful",
  "durable",
  "portable",
  "creative",
  "aesthetic",
  "exquisite",
  "affordable",
  "efficient",
  "compatible",
  "solution",
  "accessorie",
  "accessories",
  "gadget",
  "gadgets",
  "tool",
  "tools",
  "set",
  "pcs",
  "pc",
  "1pc",
  "piece",
  "pieces",
]);

const FILLER_RE =
  /\b(best quality|high quality|hot selling|imported|improted|premium|perfect for any occasion|do not collide with hard material|randomly colour? will be sent|multicolor available|gift for college girls|teen hoho|christmas decorations|atmosphere light for living room,? bedroom,? bar,?|fancy table lamps for home decorations and gifts|energy saving|foldable heater|best quality heater|solar compatible|high efficiency|durable,?|affordable winter heating for home & office|compact and efficient cooking solution|kitchen appliances|electric chulha|hot plate electric stove|electric stove for cooking|electric cooker|easy to use|best water bottle for kids and gym or office|suitable for home and office|non-toxic bpa free|wooden handles kitchen gadgets tools set for nonstick cookware|heat resistant non-toxic|with advanced.?|beautiful durable|electic meat choper kima machine|painless precision shaver for women.?s face,? lip,? chin,? bikini|electric facial razor for all skin types|for girl and child|korean students|creative portable|masson jars|mason jars with cover)\b/gi;

const CATEGORIES = [
  {
    id: "drinkware",
    match: /\b(tumbler|mug|cup|glass|sipper|flask|bottle|jug|jar|thermos|drinkware|straw)\b/i,
    label: "drinkware",
    keywords: ["drinkware Pakistan", "buy tumbler online", "water bottle Pakistan", "glass mug"],
    pitch: "durable everyday drinkware",
  },
  {
    id: "kitchen",
    match: /\b(cutlery|chopper|grinder|stove|hot plate|utensil|spatula|lighter|marinade|injector|cookware|kima|meat|vegetable|slicer|chulha)\b/i,
    label: "kitchen tools",
    keywords: ["kitchen accessories Pakistan", "kitchen gadgets", "cookware tools", "home kitchen"],
    pitch: "practical kitchen essentials",
  },
  {
    id: "heater",
    match: /\b(heater|halogen|heating pad|cramp relief|warming belt|room heater)\b/i,
    label: "heating",
    keywords: ["room heater Pakistan", "electric heater", "winter heater", "portable heater"],
    pitch: "compact home heating",
  },
  {
    id: "beauty",
    match: /\b(hair|straightener|dryer|styler|trimmer|razor|makeup|mirror|massager|facial|eyebrow|beauty)\b/i,
    label: "beauty tools",
    keywords: ["beauty tools Pakistan", "hair straightener", "makeup mirror", "personal care"],
    pitch: "everyday beauty & personal care",
  },
  {
    id: "pest",
    match: /\b(mosquito|insect|bug zapper|pest)\b/i,
    label: "pest control",
    keywords: ["mosquito killer lamp", "insect killer Pakistan", "bug zapper"],
    pitch: "home pest control",
  },
  {
    id: "air",
    match: /\b(humidifier|diffuser|air purifier|aroma|night light)\b/i,
    label: "home comfort",
    keywords: ["humidifier Pakistan", "aroma diffuser", "night light", "home comfort"],
    pitch: "home comfort essentials",
  },
  {
    id: "auto",
    match: /\b(car heating|12v|24v|automotive)\b/i,
    label: "car accessories",
    keywords: ["car heating mug", "car accessories Pakistan", "12v mug"],
    pitch: "smart car accessories",
  },
];

function titleCase(s) {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      if (/^(LED|RGB|USB|BBQ|GPH|PK|ML|OZ)$/i.test(w)) return w.toUpperCase();
      if (/^\d/.test(w) || /\d+(ml|oz|w|l|pcs)$/i.test(w)) return w;
      if (w.length <= 2 && w === w.toUpperCase()) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

function cleanRaw(name) {
  return String(name || "")
    .replace(FILLER_RE, " ")
    .replace(/[|]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/[“”"']/g, "")
    .replace(/\s*[\\/]+\s*/g, " ")
    .replace(/\s*&\s*/g, " & ")
    .replace(/[,:;]+/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCapacity(text) {
  const m = text.match(
    /\b(\d+(?:\.\d+)?\s?(?:ml|l|oz|w|pcs?|piece|litter|liter|litre)|\d+\s?in\s?\d+)\b/i,
  );
  if (!m) return "";
  return m[1]
    .replace(/\blitter\b/i, "L")
    .replace(/\bliters?\b/i, "L")
    .replace(/\blitres?\b/i, "L")
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(/PCS?/i, "pcs")
    .replace(/ML/i, "ml")
    .replace(/IN/i, "-in-");
}

function dedupeWords(text) {
  const out = [];
  const seen = new Set();
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const key = w.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out.join(" ");
}

function extractCorePhrase(cleaned) {
  // Prefer first clause before comma / dash if meaningful
  const parts = cleaned
    .split(/\s*[-–—,]\s*/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 6);
  let base = parts[0] || cleaned;

  // Drop only pure marketing lead-ins (keep Electric / Stainless when product-defining)
  base = base
    .replace(/^(new|imported|creative|lovely|cute|premium|professional|hot selling)\s+/i, "")
    .trim();

  // If still too long, keep first N meaningful words
  const words = base.split(/\s+/).filter(Boolean);
  const kept = [];
  for (const w of words) {
    const low = w.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!low) continue;
    if (STOP.has(low) && kept.length >= 2) continue;
    kept.push(w);
    if (kept.join(" ").length >= NAME_MAX - 6) break;
    if (kept.length >= 7) break;
  }
  return dedupeWords(kept.join(" ") || base.slice(0, NAME_MAX));
}

function enrichTitle(raw, core, capacity) {
  const lower = raw.toLowerCase();
  const extras = [];
  if (/\brgb\b/i.test(raw) && !/\brgb\b/i.test(core)) extras.push("RGB");
  if (/\bled\b/i.test(raw) && !/\bled\b/i.test(core)) extras.push("LED");
  if (/\bwith straw\b/i.test(lower) && !/\bstraw\b/i.test(core)) extras.push("with Straw");
  if (/\bsteel lid\b/i.test(lower) && !/\blid\b/i.test(core)) extras.push("Steel Lid");
  if (/\bborosilicate\b/i.test(lower) && !/\bborosilicate\b/i.test(core)) extras.push("Borosilicate");
  if (/\bheat resistant\b/i.test(lower) && !/\bheat\b/i.test(core)) extras.push("Heat Resistant");
  if (/\brechargeable\b/i.test(lower) && !/\brechargeable\b/i.test(core) && core.length < 40) {
    extras.push("Rechargeable");
  }

  let out = core;
  for (const e of extras) {
    const next = `${out} ${e}`.trim();
    if (next.length <= NAME_MAX) out = next;
  }
  if (capacity && !new RegExp(capacity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(out)) {
    const withCap = `${out} ${capacity}`.trim();
    if (withCap.length <= NAME_MAX) out = withCap;
  }
  return out;
}

function shortenName(raw) {
  const cleaned = cleanRaw(raw);
  const capacity = extractCapacity(cleaned);
  let core = extractCorePhrase(cleaned);
  core = enrichTitle(cleaned, core, capacity);

  // Hard clamp on word boundary
  if (core.length > NAME_MAX) {
    const slice = core.slice(0, NAME_MAX - 1);
    const cut = slice.lastIndexOf(" ");
    core = (cut > 18 ? slice.slice(0, cut) : slice).trim();
  }

  // Light polish
  core = core
    .replace(/\bGph\b/gi, "GPH")
    .replace(/\bLed\b/gi, "LED")
    .replace(/\bRgb\b/gi, "RGB")
    .replace(/\bBbq\b/gi, "BBQ")
    .replace(/\bUsb\b/gi, "USB")
    .replace(/\b1 litter\b/gi, "1L")
    .replace(/\blitter\b/gi, "L")
    .replace(/\bcock mug\b/gi, "Glass Mug");

  return titleCase(dedupeWords(core)).replace(/\s+/g, " ").trim();
}

function detectCategory(text) {
  for (const c of CATEGORIES) {
    if (c.match.test(text)) return c;
  }
  return {
    id: "home",
    label: "home essentials",
    keywords: ["home essentials Pakistan", "buy online Pakistan", "SimpleCart Store"],
    pitch: "everyday home essentials",
  };
}

function clamp(text, max) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, max - 1);
  const cut = slice.lastIndexOf(" ");
  return `${(cut > Math.floor(max * 0.55) ? slice.slice(0, cut) : slice).trim()}…`;
}

function buildSeoTitle(shortName) {
  // Store WITHOUT brand suffix — storefront suffixTitle adds site name.
  // Prefer buyer intent when room remains.
  const withIntent = `${shortName} – Buy Online PK`;
  if (withIntent.length <= SEO_TITLE_MAX) return withIntent;
  return clamp(shortName, SEO_TITLE_MAX);
}

function buildSeoDescription(shortName, category, price) {
  const priceBit =
    typeof price === "number" && price > 0
      ? ` Priced from Rs ${Math.round(price).toLocaleString("en-PK")}.`
      : "";
  const body = `Buy ${shortName} online at ${BRAND}. ${category.pitch} with fast delivery across Pakistan.${priceBit} Shop quality ${category.label} today.`;
  return clamp(body, SEO_DESC_MAX);
}

function buildShortDescription(shortName, category) {
  return clamp(
    `${shortName} — ${category.pitch} from ${BRAND}. Order online with delivery across Pakistan.`,
    160,
  );
}

function buildKeywords(shortName, category, raw) {
  const tokens = shortName
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
  const uniq = [];
  const push = (k) => {
    const v = String(k || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (!v || v.length < 3 || uniq.includes(v)) return;
    uniq.push(v);
  };
  push(shortName);
  push(`buy ${shortName}`);
  push(`${shortName} Pakistan`);
  push(`${shortName} online`);
  for (const k of category.keywords) push(k);
  push("online shopping Pakistan");
  push(BRAND);
  push("home essentials");
  for (const t of tokens.slice(0, 6)) push(t);
  // light raw crumbs
  const cap = extractCapacity(raw);
  if (cap) push(cap.toLowerCase());
  return uniq.slice(0, 14);
}

function buildTags(shortName, category) {
  const tags = new Set([category.id, "pakistan", "home"]);
  for (const t of shortName.toLowerCase().split(/[^a-z0-9]+/)) {
    if (t.length > 2 && !STOP.has(t)) tags.add(t);
    if (tags.size >= 10) break;
  }
  return [...tags].slice(0, 12);
}

const SITE = {
  // Keep site_title SHORT — storefront appends it as "| {site}" on product pages.
  store_name: BRAND,
  site_title: BRAND,
  site_description:
    "Shop tumblers, water bottles, kitchen tools, beauty gadgets and home essentials at SimpleCart Store. Quality products, fair prices, and delivery across Pakistan.",
};

const ROUTES = [
  {
    key: "/",
    title: "Home, Kitchen & Beauty Essentials",
    description: SITE.site_description,
    keywords: [
      "online shopping Pakistan",
      "SimpleCart Store",
      "home essentials Pakistan",
      "kitchen accessories",
      "water bottles Pakistan",
      "beauty tools Pakistan",
      "buy online Pakistan",
    ],
  },
  {
    key: "/collections",
    title: "Shop All Products",
    description:
      "Browse drinkware, kitchen tools, beauty gadgets, heaters and home essentials at SimpleCart Store. Quality picks with delivery across Pakistan.",
    keywords: [
      "shop all products",
      "home essentials Pakistan",
      "kitchen accessories online",
      "drinkware Pakistan",
      "SimpleCart Store",
    ],
  },
  {
    key: "/collections/sale",
    title: "Sale & Deals",
    description:
      "Explore sale deals on home, kitchen and beauty essentials at SimpleCart Store. Save on popular products with delivery across Pakistan.",
    keywords: ["sale Pakistan", "deals SimpleCart Store", "home essentials sale"],
  },
  {
    key: "/bundles",
    title: "Product Bundles & Combos",
    description:
      "Shop curated product bundles at SimpleCart Store — convenient home and kitchen combos with delivery across Pakistan.",
    keywords: ["product bundles Pakistan", "combo deals", "SimpleCart Store"],
  },
  {
    key: "/contact",
    title: "Contact & Customer Support",
    description:
      "Need help with an order or product? Contact SimpleCart Store for support, delivery questions, and shopping assistance across Pakistan.",
    keywords: ["contact SimpleCart Store", "customer support", "order help Pakistan"],
  },
  {
    key: "/search",
    title: "Search Products",
    description:
      "Search tumblers, bottles, kitchen tools, beauty gadgets and home essentials at SimpleCart Store.",
    keywords: ["search products", "SimpleCart Store", "home essentials"],
  },
];

async function main() {
  console.log(DRY ? "DRY RUN — no writes" : "LIVE — writing SEO updates");

  const { data: products, error } = await sb
    .from("products")
    .select("id,name,slug,short_description,tags,status")
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const ids = products.map((p) => p.id);

  // Price via default variant
  const { data: variants } = await sb
    .from("product_variants")
    .select("product_id,price")
    .in("product_id", ids)
    .eq("is_default", true);

  const priceByProduct = new Map((variants || []).map((v) => [v.product_id, Number(v.price) || 0]));

  // First image for OG
  const { data: assets } = await sb
    .from("product_assets")
    .select("product_id,url,sort_order")
    .in("product_id", ids)
    .order("sort_order", { ascending: true });

  const ogByProduct = new Map();
  for (const a of assets || []) {
    if (!ogByProduct.has(a.product_id) && a.url) ogByProduct.set(a.product_id, a.url);
  }

  const { data: existingSeo } = await sb
    .from("seo_meta")
    .select("id,subject_id,og_image_url,og_image_alt")
    .eq("subject_type", "product")
    .in("subject_id", ids);
  const seoRowByProduct = new Map((existingSeo || []).map((s) => [s.subject_id, s]));

  const report = [];
  let updated = 0;

  for (const p of products) {
    const shortName = shortenName(p.name);
    const category = detectCategory(`${p.name} ${shortName}`);
    const price = priceByProduct.get(p.id) || 0;
    const seoTitle = buildSeoTitle(shortName);
    const seoDesc = buildSeoDescription(shortName, category, price);
    const shortDesc = buildShortDescription(shortName, category);
    const keywords = buildKeywords(shortName, category, p.name);
    const tags = buildTags(shortName, category);
    const canonical = `${origin}/products/${encodeURIComponent(p.slug)}`;
    const og = ogByProduct.get(p.id) || seoRowByProduct.get(p.id)?.og_image_url || null;

    report.push({
      id: p.id,
      before: p.name,
      after: shortName,
      seoTitle,
      seoDesc,
      category: category.id,
    });

    if (DRY) continue;

    const { error: pErr } = await sb
      .from("products")
      .update({
        name: shortName,
        short_description: shortDesc,
        tags,
      })
      .eq("id", p.id);
    if (pErr) throw new Error(`product ${p.id}: ${pErr.message}`);

    const seoPayload = {
      subject_type: "product",
      subject_id: p.id,
      locale: "en",
      title: seoTitle,
      description: seoDesc,
      keywords,
      canonical_url: canonical,
      og_image_url: og,
      og_image_alt: shortName,
      twitter_card: "summary_large_image",
      noindex: false,
      nofollow: false,
    };

    const { error: sErr } = await sb.from("seo_meta").upsert(seoPayload, {
      onConflict: "subject_type,subject_id,locale",
    });
    if (sErr) {
      // Some schemas use different unique constraint names — fallback update/insert
      const existing = seoRowByProduct.get(p.id);
      if (existing?.id) {
        const { error: uErr } = await sb.from("seo_meta").update(seoPayload).eq("id", existing.id);
        if (uErr) throw new Error(`seo_meta ${p.id}: ${uErr.message}`);
      } else {
        throw new Error(`seo_meta ${p.id}: ${sErr.message}`);
      }
    }
    updated++;
    if (updated % 15 === 0) console.log(`… ${updated}/${products.length}`);
  }

  // Site-wide
  if (!DRY) {
    const { error: setErr } = await sb
      .from("store_settings")
      .update({
        store_name: SITE.store_name,
        site_title: SITE.site_title,
        site_description: SITE.site_description,
      })
      .eq("id", 1);
    if (setErr) throw new Error(`store_settings: ${setErr.message}`);

    // seo_site org name if present
    await sb
      .from("seo_site")
      .update({
        organization_legal_name: BRAND,
        default_og_image_alt: `${BRAND} — home, kitchen & beauty essentials`,
        locale: "en-PK",
      })
      .eq("id", 1);

    for (const r of ROUTES) {
      const payload = {
        subject_type: "route",
        subject_key: r.key,
        subject_id: null,
        locale: "en",
        title: r.title,
        description: r.description,
        keywords: r.keywords,
        twitter_card: "summary_large_image",
        noindex: r.key === "/search",
        nofollow: false,
      };
      const { data: existing } = await sb
        .from("seo_meta")
        .select("id")
        .eq("subject_type", "route")
        .eq("subject_key", r.key)
        .eq("locale", "en")
        .maybeSingle();
      if (existing?.id) {
        const { error: e } = await sb.from("seo_meta").update(payload).eq("id", existing.id);
        if (e) throw new Error(`route ${r.key}: ${e.message}`);
      } else {
        const { error: e } = await sb.from("seo_meta").insert(payload);
        if (e) throw new Error(`route insert ${r.key}: ${e.message}`);
      }
    }
  }

  const outPath = resolve(root, "scripts/.seo-finalize-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nProducts processed: ${report.length}`);
  console.log(`Report: ${outPath}`);
  console.log("\nSample renames:");
  for (const row of report.slice(0, 12)) {
    console.log(`- ${row.before.slice(0, 70)}`);
    console.log(`  → ${row.after}`);
    console.log(`  SEO: ${row.seoTitle}`);
  }
  if (!DRY) console.log(`\nUpdated products: ${updated}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
