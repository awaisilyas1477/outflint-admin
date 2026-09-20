/**
 * Polish Merchant Center / Shopping attributes:
 * - brand_name = SimpleCart Store
 * - normalize material casing
 * - country_of_origin = PK
 * - fill MPN from SKU when empty
 * - link return/shipping policies
 * - never invent GTINs
 *
 * Usage: node scripts/polish-merchant-attrs.mjs [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");
const BRAND = "SimpleCart Store";

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
    mixed: "Mixed materials",
  };
  const k = t.toLowerCase();
  return known[k] || t.replace(/\b\w/g, (c) => c.toUpperCase());
}

function inferMaterial(name) {
  const n = String(name || "").toLowerCase();
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
  return "Mixed materials";
}

const e = loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);

const { data: policies } = await sb.from("policy_pages").select("id,slug");
const ret = policies?.find((p) => p.slug === "return-policy");
const ship = policies?.find((p) => p.slug === "shipping-policy");
if (!ret || !ship) {
  console.error("Missing policies", { ret: !!ret, ship: !!ship });
  process.exit(1);
}

const { data: products } = await sb
  .from("products")
  .select("id,name,status")
  .eq("status", "active");
const ids = (products || []).map((p) => p.id);
const nameBy = new Map((products || []).map((p) => [p.id, p.name]));

const { data: variants } = await sb
  .from("product_variants")
  .select("product_id,sku,created_at")
  .in("product_id", ids)
  .order("created_at", { ascending: true });
const skuBy = new Map();
for (const v of variants || []) {
  if (!skuBy.has(v.product_id) && (v.sku || "").trim()) {
    skuBy.set(v.product_id, String(v.sku).trim());
  }
}

const { data: shopRows } = await sb
  .from("product_shopping_attributes")
  .select(
    "product_id,brand_name,gtin,mpn,material,country_of_origin,return_policy_id,shipping_policy_id",
  )
  .in("product_id", ids);
const shopBy = new Map((shopRows || []).map((r) => [r.product_id, r]));

const stats = {
  dry: DRY,
  updated: 0,
  inserted: 0,
  brand: 0,
  material: 0,
  mpn: 0,
  origin: 0,
  policies: 0,
};

for (const id of ids) {
  const row = shopBy.get(id);
  const material = titleCaseMaterial(row?.material || inferMaterial(nameBy.get(id)));
  const mpn = (row?.mpn || "").trim() || skuBy.get(id) || "";
  const patch = {
    brand_name: BRAND,
    material,
    country_of_origin: "PK",
    return_policy_id: ret.id,
    shipping_policy_id: ship.id,
    mpn: mpn || null,
  };

  if (!row) {
    if (!DRY) {
      const { error } = await sb.from("product_shopping_attributes").insert({
        product_id: id,
        ...patch,
        gtin: null,
      });
      if (error) throw new Error(`insert ${id}: ${error.message}`);
    }
    stats.inserted++;
    continue;
  }

  const changes = {};
  if ((row.brand_name || "").trim() !== BRAND) {
    changes.brand_name = BRAND;
    stats.brand++;
  }
  if (titleCaseMaterial(row.material) !== material || !(row.material || "").trim()) {
    changes.material = material;
    stats.material++;
  }
  if ((row.country_of_origin || "").trim() !== "PK") {
    changes.country_of_origin = "PK";
    stats.origin++;
  }
  if (!(row.mpn || "").trim() && mpn) {
    changes.mpn = mpn;
    stats.mpn++;
  }
  if (row.return_policy_id !== ret.id || row.shipping_policy_id !== ship.id) {
    changes.return_policy_id = ret.id;
    changes.shipping_policy_id = ship.id;
    stats.policies++;
  }

  if (Object.keys(changes).length === 0) continue;
  if (!DRY) {
    const { error } = await sb
      .from("product_shopping_attributes")
      .update(changes)
      .eq("product_id", id);
    if (error) throw new Error(`update ${id}: ${error.message}`);
  }
  stats.updated++;
}

writeFileSync(
  resolve(root, "scripts/.polish-merchant-attrs-report.json"),
  JSON.stringify(stats, null, 2),
);
console.log(JSON.stringify(stats, null, 2));
