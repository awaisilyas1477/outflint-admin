/**
 * Fix shopping policy links + fill MPN from SKU when GTIN/MPN empty.
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

const { data: policies } = await sb.from("policy_pages").select("id,slug");
const ret = policies?.find((p) => p.slug === "return-policy");
const ship = policies?.find((p) => p.slug === "shipping-policy");
if (!ret || !ship) {
  console.error("Policies missing", { ret, ship });
  process.exit(1);
}

const { data: products } = await sb.from("products").select("id").eq("status", "active");
const ids = (products || []).map((p) => p.id);

const { data: shopRows } = await sb
  .from("product_shopping_attributes")
  .select("product_id,return_policy_id,shipping_policy_id,gtin,mpn")
  .in("product_id", ids);

let policyFixed = 0;
for (const row of shopRows || []) {
  const patch = {};
  if (!row.return_policy_id) patch.return_policy_id = ret.id;
  if (!row.shipping_policy_id) patch.shipping_policy_id = ship.id;
  if (Object.keys(patch).length) {
    const { error } = await sb
      .from("product_shopping_attributes")
      .update(patch)
      .eq("product_id", row.product_id);
    if (error) console.error("policy patch fail", row.product_id, error.message);
    else policyFixed++;
  }
}
console.log("policy links fixed:", policyFixed);

// Fill MPN from default/first variant SKU when empty (Merchant identifier_exists fallback)
const { data: variants } = await sb
  .from("product_variants")
  .select("product_id,sku,created_at")
  .in("product_id", ids)
  .order("created_at", { ascending: true });

const skuByProduct = new Map();
for (const v of variants || []) {
  if (!skuByProduct.has(v.product_id) && (v.sku || "").trim()) {
    skuByProduct.set(v.product_id, String(v.sku).trim());
  }
}

let mpnFixed = 0;
for (const row of shopRows || []) {
  if ((row.gtin || "").trim() || (row.mpn || "").trim()) continue;
  const mpn = skuByProduct.get(row.product_id);
  if (!mpn) continue;
  const { error } = await sb
    .from("product_shopping_attributes")
    .update({ mpn })
    .eq("product_id", row.product_id);
  if (error) console.error("mpn fail", row.product_id, error.message);
  else mpnFixed++;
}
console.log("mpn filled from sku:", mpnFixed);

const { data: verify } = await sb
  .from("product_shopping_attributes")
  .select("product_id,return_policy_id,shipping_policy_id,mpn,gtin")
  .in("product_id", ids);
const missingRet = (verify || []).filter((r) => !r.return_policy_id).length;
const missingShip = (verify || []).filter((r) => !r.shipping_policy_id).length;
const withMpn = (verify || []).filter((r) => (r.mpn || "").trim()).length;
const withGtin = (verify || []).filter((r) => (r.gtin || "").trim()).length;
console.log({ missingRet, missingShip, withMpn, withGtin, total: ids.length });
