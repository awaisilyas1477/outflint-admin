/**
 * Fix 24-Piece Golden Cutlery Set duplicate variants after price import.
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
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const e = loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);

const NAME = "24-Piece Golden Cutlery Set";
const { data: p } = await sb.from("products").select("id").eq("name", NAME).maybeSingle();
if (!p) throw new Error("product not found");

const { data: vars } = await sb
  .from("product_variants")
  .select("id, sku, price, option_values")
  .eq("product_id", p.id);

for (const v of vars ?? []) {
  const ov = v.option_values ?? {};
  const label = String(ov.color ?? "").toLowerCase();

  if (label.includes("full golden")) {
    await sb.from("product_variants").update({ price: 5499 }).eq("id", v.id);
    continue;
  }
  if (label.includes("black golden")) {
    await sb.from("product_variants").update({ price: 6499 }).eq("id", v.id);
    continue;
  }
  if (ov.option) {
    await sb.from("inventory").delete().eq("product_variant_id", v.id);
    await sb.from("product_variants").delete().eq("id", v.id);
    console.log("Removed duplicate", v.sku);
  }
}

await sb.from("product_option_definitions").delete().eq("product_id", p.id);
await sb.from("product_option_definitions").insert({
  product_id: p.id,
  option_key: "color",
  label: "Color",
  presentation: "pills",
  sort_order: 0,
});

const { data: after } = await sb
  .from("product_variants")
  .select("sku, price, option_values")
  .eq("product_id", p.id);
console.log(JSON.stringify(after, null, 2));
