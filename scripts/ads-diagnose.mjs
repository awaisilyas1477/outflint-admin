/**
 * Diagnose false fails from ads-readiness-audit + fix shopping policy links.
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

const tables = [
  "policy_pages",
  "policies",
  "store_policies",
  "shipping_policies",
  "return_policies",
];
for (const t of tables) {
  const { data, error } = await sb.from(t).select("*").limit(5);
  console.log(`\n=== ${t} ===`, error?.message || "ok", data?.length ?? 0);
  if (data?.[0]) console.log("keys", Object.keys(data[0]));
  if (data) console.log(JSON.stringify(data, null, 2).slice(0, 1500));
}

const { data: vars } = await sb.from("product_variants").select("*").limit(2);
console.log("\n=== product_variants keys ===", vars?.[0] ? Object.keys(vars[0]) : null);
console.log(JSON.stringify(vars?.[0], null, 2));

const { data: products } = await sb
  .from("products")
  .select("id,name,slug")
  .eq("status", "active");
const ids = products.map((p) => p.id);
const { data: allVars } = await sb
  .from("product_variants")
  .select("*")
  .in("product_id", ids)
  .limit(5);
console.log("\nactive sample vars", JSON.stringify(allVars, null, 2).slice(0, 2000));

const { data: shopMissing } = await sb
  .from("product_shopping_attributes")
  .select("product_id,return_policy_id,shipping_policy_id,brand_name")
  .or("return_policy_id.is.null,shipping_policy_id.is.null");
console.log("\nmissing policy links", shopMissing);

const { data: pages } = await sb.from("pages").select("id,slug,title,status").limit(30);
console.log("\npages", pages?.map((p) => p.slug));
