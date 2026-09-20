/**
 * Rewrite active product PDP descriptions as unique long-form SEO HTML.
 *
 * - Brand: SimpleCart Store only (never Daraz)
 * - Unique feature blocks from name / material / collection / tags
 * - Short shared COD closing (OK) — lead + features must differ per SKU
 *
 * Usage:
 *   node scripts/rewrite-product-descriptions.mjs [--dry-run] [--limit=N]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Math.max(1, Number(limitArg.split("=")[1]) || 0) : 0;

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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripHtml(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(seed, arr) {
  return arr[seed % arr.length];
}

function titleCaseMaterial(m) {
  const t = String(m || "").trim();
  if (!t) return "";
  const known = {
    "stainless steel": "Stainless steel",
    glass: "Glass",
    silicone: "Silicone",
    plastic: "Plastic",
    ceramic: "Ceramic",
    fabric: "Fabric",
    wood: "Wood",
    bamboo: "Wood",
    aluminum: "Aluminum",
    aluminium: "Aluminum",
    copper: "Copper",
    "mixed materials": "Mixed materials",
  };
  const k = t.toLowerCase();
  return known[k] || t.charAt(0).toUpperCase() + t.slice(1);
}

function inferMaterial(name) {
  const n = name.toLowerCase();
  if (/stainless|steel|vacuum|thermos|flask/.test(n)) return "Stainless steel";
  if (/borosilicate|glass/.test(n)) return "Glass";
  if (/silicone/.test(n)) return "Silicone";
  if (/plastic|abs|pp\b|straw/.test(n)) return "Plastic";
  if (/ceramic/.test(n)) return "Ceramic";
  if (/cotton|fabric|textile|leather/.test(n)) return "Fabric";
  if (/wood|bamboo/.test(n)) return "Wood";
  if (/aluminum|aluminium/.test(n)) return "Aluminum";
  if (/copper/.test(n)) return "Copper";
  if (
    /led|lamp|light|heater|kettle|humidifier|massager|trimmer|dryer|straightener|racket|zapper|blender|juicer|shaver|mic|watch/.test(
      n,
    )
  )
    return "Mixed materials";
  return "";
}

function extractCapacity(name) {
  const m = String(name).match(/(\d+(?:\.\d+)?)\s*(ml|l|litre|liter|oz)\b/i);
  if (!m) return "";
  const unit = m[2].toLowerCase().startsWith("l") ? (m[2].toLowerCase() === "ml" ? "ml" : "L") : m[2];
  return `${m[1]}${unit === "liter" || unit === "litre" ? "L" : unit}`;
}

function extractFeatures(name, material, tags) {
  const n = name.toLowerCase();
  const feats = [];
  const capacity = extractCapacity(name);
  if (capacity) feats.push(`${capacity} capacity`);
  if (material) feats.push(`${material} build`);
  if (/vacuum|thermos|insulated|double.?wall/.test(n)) feats.push("insulated hot & cold performance");
  if (/leak.?proof|airtight|sealed/.test(n)) feats.push("leak-resistant design");
  if (/portable|travel|mini|compact|foldable/.test(n)) feats.push("compact, travel-friendly size");
  if (/rechargeable|usb|wireless/.test(n)) feats.push("rechargeable / USB-powered convenience");
  if (/electric|motor|blender|juicer|kettle|heater/.test(n)) feats.push("electric everyday convenience");
  if (/led|lamp|light|night/.test(n)) feats.push("practical lighting for home use");
  if (/mosquito|racket|zapper|pest/.test(n)) feats.push("pest-control focused design");
  if (/massage|wellness/.test(n)) feats.push("comfort / wellness focused use");
  if (/kids|cartoon|children/.test(n)) feats.push("kid-friendly styling");
  if (/set|kit|combo|pair/.test(n)) feats.push("value set / multi-piece kit");
  if (/stainless|steel/.test(n)) feats.push("durable stainless finish");
  if (/glass|borosilicate/.test(n)) feats.push("clear glass presentation");
  if (/silicone|soft|grip/.test(n)) feats.push("comfortable grip / soft-touch feel");
  if (/straw|sipper|tumbler|mug|cup|bottle|flask/.test(n)) feats.push("everyday drinkware use");
  if (/kitchen|cutlery|grater|sieve|chopstick|blender|juicer/.test(n))
    feats.push("kitchen prep convenience");
  if (/beauty|trimmer|shaver|wax|shampoo|comb/.test(n)) feats.push("personal-care convenience");

  for (const t of tags || []) {
    const tag = String(t || "").toLowerCase();
    if (!tag || tag.startsWith("daraz:") || tag.startsWith("rating_breakdown")) continue;
    if (["pakistan", "cod", "home", "sale"].includes(tag)) continue;
    if (feats.length < 8 && tag.length > 2 && tag.length < 28) {
      feats.push(`${tag} category fit`);
    }
  }

  // de-dupe
  const seen = new Set();
  const out = [];
  for (const f of feats) {
    const k = f.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out.slice(0, 7);
}

const COL_COPY = {
  drinkware: {
    label: "drinkware",
    use: "daily hydration at home, work, or on the go",
    tip: "Rinse after each use and air-dry with the lid open to keep bottles fresh.",
  },
  kitchen: {
    label: "kitchen tools",
    use: "everyday cooking and food prep",
    tip: "Hand-wash when possible and dry thoroughly before storing with your other utensils.",
  },
  appliances: {
    label: "home appliances",
    use: "compact home tasks that save time",
    tip: "Place on a stable surface, follow the included power guidance, and unplug when not in use.",
  },
  beauty: {
    label: "beauty & personal care",
    use: "at-home grooming and self-care routines",
    tip: "Clean contact surfaces after use and store away from moisture when possible.",
  },
  lighting: {
    label: "home lighting",
    use: "bedrooms, desks, or cozy evening corners",
    tip: "Keep cords tidy and use on a dry, stable surface away from water.",
  },
  "pest-control": {
    label: "pest control",
    use: "safer evenings indoors and on balconies",
    tip: "Use as directed, keep out of children's reach when powered, and store dry.",
  },
  wellness: {
    label: "wellness",
    use: "daily comfort and recovery at home",
    tip: "Start on a gentle setting and stop if you feel discomfort.",
  },
  home: {
    label: "home essentials",
    use: "everyday household convenience",
    tip: "Wipe clean with a soft cloth and store in a dry place when not in use.",
  },
};

function buildUniqueHtml(p) {
  const name = String(p.name || "Product").trim();
  const safe = escapeHtml(name);
  const seed = hash32(p.id || name);
  const material = titleCaseMaterial(p.material || inferMaterial(name));
  const col = COL_COPY[p.collectionSlug] || COL_COPY.home;
  const features = extractFeatures(name, material, p.tags);
  const capacity = extractCapacity(name);
  const shortPlain = stripHtml(p.short_description).replace(/\bDaraz\b/gi, "SimpleCart Store");

  const leadVariants = [
    `Looking for <strong>${safe}</strong> in Pakistan? SimpleCart Store lists this ${col.label} pick for ${col.use} — with clear pricing in PKR and cash on delivery at checkout.`,
    `<strong>${safe}</strong> is a practical ${col.label} pick for Pakistani homes. Shop it online at SimpleCart Store with nationwide delivery and COD available.`,
    `Order <strong>${safe}</strong> from SimpleCart Store when you want reliable ${col.label} for ${col.use}. Fair PKR pricing, careful packing, and delivery across Pakistan.`,
    `Bring home <strong>${safe}</strong> for ${col.use}. Available online at SimpleCart Store with cash on delivery and support if you need help after your order.`,
  ];

  const audienceVariants = [
    `Ideal for shoppers who want ${col.label} that is easy to use day to day without a complicated setup.`,
    `A solid match for families and individuals upgrading everyday ${col.label} with a simple online order.`,
    `Chosen for people who prefer practical ${col.label} that fits real Pakistani home routines.`,
  ];

  if (capacity) {
    audienceVariants.push(
      `Sized at ${escapeHtml(capacity)}, it suits everyday portions without feeling oversized for small kitchens or bags.`,
    );
  }
  if (material) {
    audienceVariants.push(
      `Built with a ${escapeHtml(material.toLowerCase())} focus so the look and feel match how you actually use it at home.`,
    );
  }

  const whyTitle = pick(seed, [
    "What stands out",
    "Key details",
    "Product highlights",
    "Why shoppers pick it",
  ]);
  const useTitle = pick(seed + 3, ["Best for", "Everyday use", "Where it fits"]);
  const careTitle = pick(seed + 7, ["Care tip", "How to keep it lasting", "Quick care note"]);

  const featureLis =
    features.length > 0
      ? features.map((f) => `<li>${escapeHtml(f.charAt(0).toUpperCase() + f.slice(1))}</li>`).join("")
      : `<li>Practical ${escapeHtml(col.label)} for daily home use</li><li>Order online with COD across Pakistan</li>`;

  const shortBlock =
    shortPlain && shortPlain.length >= 40 && !/why choose this product/i.test(shortPlain)
      ? `<p>${escapeHtml(shortPlain)}</p>`
      : "";

  // Avoid identical short + lead when short is already a thin template
  const lead = pick(seed, leadVariants);
  const audience = pick(seed + 11, audienceVariants);

  return [
    `<p>${lead}</p>`,
    shortBlock && !shortPlain.toLowerCase().includes(name.toLowerCase().slice(0, 18))
      ? shortBlock
      : "",
    `<p>${audience}</p>`,
    `<h3>${whyTitle}</h3>`,
    `<ul>${featureLis}</ul>`,
    `<h3>${useTitle}</h3>`,
    `<p>Use <strong>${safe}</strong> for ${escapeHtml(col.use)}. It sits naturally in our ${escapeHtml(col.label)} range at SimpleCart Store — browse related items if you are building a matching set.</p>`,
    `<h3>${careTitle}</h3>`,
    `<p>${escapeHtml(col.tip)}</p>`,
    `<h3>Shipping &amp; returns</h3>`,
    `<p>We typically pack within 1–2 business days. Delivery usually takes 2–5 business days in major cities and 4–8 business days elsewhere. Damaged or incorrect items can be reported within 7 days — see our Shipping Policy and Return Policy.</p>`,
    `<p>Shop <strong>${safe}</strong> with confidence at <strong>SimpleCart Store</strong> — home, kitchen and beauty essentials online in Pakistan with cash on delivery.</p>`,
  ]
    .filter(Boolean)
    .join("\n");
}

const e = loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);

let q = sb
  .from("products")
  .select("id,slug,name,short_description,description,tags,status")
  .eq("status", "active")
  .order("name", { ascending: true });
if (LIMIT) q = q.limit(LIMIT);
const { data: products, error } = await q;
if (error) throw new Error(error.message);

const ids = (products || []).map((p) => p.id);

async function fetchInChunks(table, select, idColumn, idList) {
  const out = [];
  const chunkSize = 80;
  for (let i = 0; i < idList.length; i += chunkSize) {
    const chunk = idList.slice(i, i + chunkSize);
    const { data, error: qErr } = await sb.from(table).select(select).in(idColumn, chunk);
    if (qErr) throw new Error(`${table}: ${qErr.message}`);
    out.push(...(data || []));
  }
  return out;
}

const pc = await fetchInChunks(
  "product_collections",
  "product_id,collection_id",
  "product_id",
  ids,
);
const { data: cols } = await sb.from("collections").select("id,slug,name");
const colById = new Map((cols || []).map((c) => [c.id, c]));
const primaryCol = new Map();
const COL_PRIORITY = {
  drinkware: 1,
  kitchen: 2,
  appliances: 3,
  beauty: 4,
  lighting: 5,
  "pest-control": 6,
  wellness: 7,
  home: 90,
};
for (const row of pc || []) {
  const col = colById.get(row.collection_id);
  const score = COL_PRIORITY[col?.slug] ?? 50;
  const cur = primaryCol.get(row.product_id);
  if (!cur || score < cur.score) {
    primaryCol.set(row.product_id, { ...row, score });
  }
}

const shop = await fetchInChunks(
  "product_shopping_attributes",
  "product_id,material",
  "product_id",
  ids,
);
const shopBy = new Map((shop || []).map((s) => [s.product_id, s]));

function collectionSlugFor(p) {
  const link = primaryCol.get(p.id);
  const fromJoin = link ? colById.get(link.collection_id)?.slug : "";
  if (fromJoin && COL_COPY[fromJoin]) return fromJoin;
  for (const t of p.tags || []) {
    const tag = String(t || "").toLowerCase();
    if (COL_COPY[tag]) return tag;
  }
  return "home";
}

const report = { dry: DRY, updated: 0, samples: [], lengths: [], colCounts: {} };

for (const p of products || []) {
  const collectionSlug = collectionSlugFor(p);
  report.colCounts[collectionSlug] = (report.colCounts[collectionSlug] || 0) + 1;
  const material = titleCaseMaterial(shopBy.get(p.id)?.material || inferMaterial(p.name));
  const html = buildUniqueHtml({
    id: p.id,
    name: p.name,
    short_description: p.short_description,
    tags: p.tags,
    material,
    collectionSlug,
  });
  const plainLen = stripHtml(html).length;
  report.lengths.push(plainLen);
  if (report.samples.length < 5) {
    report.samples.push({
      slug: p.slug,
      collectionSlug,
      plainLen,
      preview: stripHtml(html).slice(0, 180),
    });
  }
  if (!DRY) {
    const { error: uErr } = await sb.from("products").update({ description: html }).eq("id", p.id);
    if (uErr) throw new Error(`${p.slug}: ${uErr.message}`);
  }
  report.updated++;
}

report.lengths.sort((a, b) => a - b);
report.lengthStats = {
  min: report.lengths[0] || 0,
  p50: report.lengths[Math.floor(report.lengths.length / 2)] || 0,
  max: report.lengths[report.lengths.length - 1] || 0,
  count: report.lengths.length,
};
delete report.lengths;

writeFileSync(
  resolve(root, "scripts/.rewrite-descriptions-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
