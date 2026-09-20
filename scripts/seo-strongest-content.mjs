/**
 * Stronger on-page SEO content:
 * - Rename collections to keyword-rich names (nav/H1/footer)
 * - Rewrite product long descriptions (clean HTML)
 * - noindex orphan redirect routes
 * - Fill more materials where inferable
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
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const e = loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);

const COL_NAMES = {
  drinkware: {
    name: "Water Bottles & Tumblers",
    description:
      "Shop stainless steel flasks, tumblers, glass sippers and everyday water bottles at SimpleCart Store. Hot & cold drinkware with cash on delivery across Pakistan.",
  },
  kitchen: {
    name: "Kitchen Tools & Utensils",
    description:
      "Find everyday kitchen tools, cutlery and prep gadgets at SimpleCart Store. Quality cooking essentials with nationwide COD delivery in Pakistan.",
  },
  appliances: {
    name: "Home Appliances",
    description:
      "Compact home appliances for everyday comfort — kettles, heaters and more from SimpleCart Store with cash on delivery across Pakistan.",
  },
  beauty: {
    name: "Beauty & Personal Care",
    description:
      "Beauty and personal care tools for home use — straighteners, dryers, mirrors and more at SimpleCart Store with COD across Pakistan.",
  },
  lighting: {
    name: "Lamps & Night Lights",
    description:
      "Ambient lamps, night lights and practical work lights for home and outdoor use. Shop lighting at SimpleCart Store with delivery in Pakistan.",
  },
  "pest-control": {
    name: "Mosquito Killers & Pest Control",
    description:
      "Mosquito killer lamps and rackets for safer evenings at home. Order pest-control essentials from SimpleCart Store with COD in Pakistan.",
  },
  wellness: {
    name: "Massagers & Wellness",
    description:
      "Massage and wellness gadgets for daily relief. Shop comfort essentials at SimpleCart Store with nationwide COD delivery.",
  },
  home: {
    name: "Home Essentials",
    description:
      "Everyday home essentials and household gadgets for Pakistan homes. Browse SimpleCart Store with cash on delivery nationwide.",
  },
};

const { data: cols } = await sb.from("collections").select("id,slug,name");
for (const c of cols || []) {
  const conf = COL_NAMES[c.slug];
  if (!conf) continue;
  await sb
    .from("collections")
    .update({ name: conf.name, description: conf.description })
    .eq("id", c.id);
  console.log("collection rename", c.slug, "→", conf.name);
}

// noindex orphan routes that permanently redirect
for (const key of ["/sale", "/collections/sale", "/bundles"]) {
  const { data: row } = await sb
    .from("seo_meta")
    .select("id")
    .eq("subject_type", "route")
    .eq("subject_key", key)
    .eq("locale", "en")
    .maybeSingle();
  if (row?.id) {
    await sb
      .from("seo_meta")
      .update({ noindex: true, nofollow: false, canonical_url: "" })
      .eq("id", row.id);
    console.log("noindex route", key);
  }
}

function inferMaterial(name) {
  const n = name.toLowerCase();
  if (/stainless|steel|vacuum|thermos|flask/.test(n)) return "Stainless steel";
  if (/borosilicate|glass|tumbler|mug|cup/.test(n) && /glass|borosilicate|crystal/.test(n))
    return "Glass";
  if (/glass/.test(n)) return "Glass";
  if (/silicone/.test(n)) return "Silicone";
  if (/plastic|abs|pp\b|kunststof|straw/.test(n)) return "Plastic";
  if (/ceramic/.test(n)) return "Ceramic";
  if (/cotton|fabric|textile/.test(n)) return "Fabric";
  if (/wood|bamboo/.test(n)) return "Wood";
  if (/aluminum|aluminium/.test(n)) return "Aluminum";
  if (/copper/.test(n)) return "Copper";
  if (/led|lamp|light|heater|kettle|humidifier|massager|trimmer|dryer|straightener|racket|zapper/.test(n))
    return "Mixed materials";
  return "";
}

function buildDescriptionHtml(name, shortDesc, material) {
  const safe = escapeHtml(name);
  const lead = shortDesc
    ? escapeHtml(shortDesc)
    : `Buy ${safe} online at SimpleCart Store — a practical home essential with cash on delivery across Pakistan.`;
  const matLine = material
    ? `<li><strong>Material:</strong> ${escapeHtml(material)}</li>`
    : "";
  return [
    `<p>${lead}</p>`,
    `<h3>Why choose this product</h3>`,
    `<ul>`,
    `<li>Order ${safe} online with nationwide delivery in Pakistan</li>`,
    `<li>Cash on delivery (COD) available at checkout</li>`,
    `<li>Packed carefully within 1–2 business days</li>`,
    matLine,
    `<li>Friendly support via WhatsApp, phone, or email</li>`,
    `</ul>`,
    `<h3>Shipping &amp; returns</h3>`,
    `<p>Delivery usually takes 2–5 business days in major cities and 4–8 business days in other areas. If something arrives damaged or incorrect, contact us within 7 days — see our Return Policy and Shipping Policy for full details.</p>`,
    `<p>Shop with confidence at <strong>SimpleCart Store</strong> — everyday home, kitchen and beauty essentials for Pakistan.</p>`,
  ]
    .filter(Boolean)
    .join("");
}

const { data: products } = await sb
  .from("products")
  .select("id,name,short_description,description")
  .eq("status", "active");
const pids = products.map((p) => p.id);
const { data: shop } = await sb
  .from("product_shopping_attributes")
  .select("product_id,material")
  .in("product_id", pids);
const shopBy = new Map((shop || []).map((s) => [s.product_id, s]));

let descUpdated = 0;
let matUpdated = 0;
for (const p of products) {
  const shopRow = shopBy.get(p.id);
  let material = (shopRow?.material || "").trim();
  if (!material) {
    material = inferMaterial(p.name);
    if (material && shopRow) {
      await sb
        .from("product_shopping_attributes")
        .update({ material })
        .eq("product_id", p.id);
      matUpdated++;
    }
  }
  const html = buildDescriptionHtml(p.name, p.short_description, material);
  await sb.from("products").update({ description: html }).eq("id", p.id);
  descUpdated++;
}

console.log({ descUpdated, matUpdated, collections: Object.keys(COL_NAMES).length });
