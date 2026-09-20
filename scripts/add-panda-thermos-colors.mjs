/**
 * Add Red / Pink / Black color variants to Cartoon Panda Thermos (same price).
 * Usage: node scripts/add-panda-thermos-colors.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function load(path) {
  const out = {};
  if (!existsSync(path)) return out;
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

const e = {
  ...load(resolve(root, "../../w-cartstore-web/e-commerce-website/.env")),
  ...load(resolve(root, ".env")),
};
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL || e.VITE_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);

const SLUG = "cartoon-panda-thermos-stainless-steel-vacuum-flask-with-lifting-rope";
const COLORS = [
  { name: "Red", hex: "#dc2626", rgb: "220, 38, 38" },
  { name: "Pink", hex: "#F9A8D4", rgb: "249, 168, 212" },
  { name: "Black", hex: "#171717", rgb: "23, 23, 23" },
];

const { data: product, error: pErr } = await sb
  .from("products")
  .select("id, name, slug")
  .eq("slug", SLUG)
  .single();
if (pErr || !product) throw new Error(pErr?.message || "Product not found");

const { data: existingVariants, error: vErr } = await sb
  .from("product_variants")
  .select("id, sku, price, compare_at_price")
  .eq("product_id", product.id);
if (vErr) throw new Error(vErr.message);

const base = existingVariants?.[0];
const price = Number(base?.price ?? 1999);
const compareAt = Number(base?.compare_at_price ?? 4999);
const baseSku = String(base?.sku || "PANDA-THERMOS-ROPE-FLASK").replace(/-(RED|PINK|BLACK)$/i, "");

let stock = 98;
if (base?.id) {
  const { data: inv } = await sb
    .from("inventory")
    .select("quantity_on_hand")
    .eq("product_variant_id", base.id)
    .maybeSingle();
  if (inv?.quantity_on_hand != null) stock = Number(inv.quantity_on_hand);
}
const perVariantStock = Math.max(1, Math.floor(stock / COLORS.length) || 30);

const colorIds = {};
for (const c of COLORS) {
  const { data: found } = await sb
    .from("colors")
    .select("id, name, hex")
    .eq("name", c.name)
    .maybeSingle();
  if (found?.id) {
    colorIds[c.name] = found.id;
    if (!found.hex && c.hex) {
      await sb.from("colors").update({ hex: c.hex, rgb: c.rgb }).eq("id", found.id);
    }
    continue;
  }
  const { data: created, error: cErr } = await sb
    .from("colors")
    .insert({
      name: c.name,
      hex: c.hex,
      rgb: c.rgb,
      swatch_image_url: "",
      is_active: true,
      sort_order: 0,
    })
    .select("id")
    .single();
  if (cErr || !created) throw new Error(`Create color ${c.name}: ${cErr?.message}`);
  colorIds[c.name] = created.id;
}

// Remove old variants + inventory (replace with color SKUs)
for (const v of existingVariants ?? []) {
  await sb.from("inventory").delete().eq("product_variant_id", v.id);
  const { error: delErr } = await sb.from("product_variants").delete().eq("id", v.id);
  if (delErr) throw new Error(`Delete variant ${v.id}: ${delErr.message}`);
}

const rows = COLORS.map((c) => ({
  product_id: product.id,
  sku: `${baseSku}-${c.name.toUpperCase()}`.slice(0, 120),
  option_values: { color: c.name },
  size_id: null,
  color_id: colorIds[c.name],
  price,
  compare_at_price: compareAt,
}));

const { data: inserted, error: insErr } = await sb
  .from("product_variants")
  .insert(rows)
  .select("id, sku, option_values, price, color_id");
if (insErr || !inserted?.length) throw new Error(insErr?.message || "Variant insert failed");

const { error: invErr } = await sb.from("inventory").insert(
  inserted.map((row) => ({
    product_variant_id: row.id,
    quantity_on_hand: perVariantStock,
    quantity_reserved: 0,
  })),
);
if (invErr) throw new Error(invErr.message);

await sb.from("product_option_definitions").delete().eq("product_id", product.id);
const { error: optErr } = await sb.from("product_option_definitions").insert({
  product_id: product.id,
  option_key: "color",
  label: "Color",
  presentation: "swatches",
  sort_order: 0,
});
if (optErr) throw new Error(optErr.message);

await sb
  .from("products")
  .update({ updated_at: new Date().toISOString() })
  .eq("id", product.id);

try {
  await fetch("https://www.simplecartstore.com/api/revalidate-review-surface", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productSlug: SLUG }),
  });
} catch {
  /* best-effort */
}

console.log(
  JSON.stringify(
    {
      product: product.slug,
      price,
      compareAt,
      perVariantStock,
      variants: inserted,
      colorIds,
    },
    null,
    2,
  ),
);
