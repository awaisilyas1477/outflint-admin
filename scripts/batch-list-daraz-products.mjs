/**
 * Batch list Daraz products (images + dual pricing + short SEO + collection).
 * Usage: node scripts/batch-list-daraz-products.mjs scripts/.batch-daraz-list.json
 *
 * JSON item shape:
 * {
 *   itemId, name, displayName?, slug?, collectionSlug,
 *   price, compareAt?, images[], shortDescription?, descriptionHtml?, material?
 * }
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://www.simplecartstore.com";

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

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function shortDisplayName(name) {
  const cleaned = String(name || "")
    .replace(/\|/g, " ")
    .replace(/\([^)]*random[^)]*\)/gi, " ")
    .replace(/\b(high quality|imported|best quality|hot selling|premium|portable high brightness)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= 48) return cleaned;
  const slice = cleaned.slice(0, 47);
  const cut = slice.lastIndexOf(" ");
  return (cut > 18 ? slice.slice(0, cut) : slice).trim();
}

function brandSafe(s) {
  return String(s || "")
    .replace(/\bDaraz\b/gi, "SimpleCart")
    .replace(/\bdaraz\b/gi, "SimpleCart");
}

function seoTitle(name) {
  const base = `${name} – Buy Online PK`;
  return base.length <= 58 ? base : `${name.slice(0, 52).trim()}…`;
}

function seoDescription(name, short) {
  const lead =
    `Buy ${name} online at SimpleCart Store. ${short} Fast delivery across Pakistan.`
      .replace(/\s+/g, " ")
      .trim();
  return lead.length <= 158 ? lead : `${lead.slice(0, 155).trim()}…`;
}

function defaultDescriptionHtml(name, bullets = []) {
  const list =
    bullets.length > 0
      ? `<ul>${bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`
      : "";
  return `
<p><strong>${name}</strong> from SimpleCart Store — a practical everyday essential with clear product details and nationwide delivery across Pakistan.</p>
${list}
<p>Cash on delivery is available at checkout. Orders are typically packed within 1–2 business days.</p>
<p>Shop with confidence at <strong>SimpleCart Store</strong>.</p>
`.trim();
}

const e = loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const inputPath = resolve(root, process.argv[2] || "scripts/.batch-daraz-list.json");
if (!existsSync(inputPath)) {
  console.error("Missing input JSON:", inputPath);
  process.exit(1);
}
const items = JSON.parse(readFileSync(inputPath, "utf8"));
if (!Array.isArray(items) || !items.length) {
  console.error("Input must be a non-empty array");
  process.exit(1);
}

const { data: collections } = await sb.from("collections").select("id, slug");
const colBySlug = Object.fromEntries((collections || []).map((c) => [c.slug, c.id]));

const { data: policies } = await sb
  .from("policy_pages")
  .select("id, slug")
  .in("slug", ["return-policy", "shipping-policy"]);
const ret = policies?.find((p) => p.slug === "return-policy");
const ship = policies?.find((p) => p.slug === "shipping-policy");

const results = [];

function dedupeImages(urls) {
  const seen = new Set();
  const out = [];
  for (const raw of urls || []) {
    const u = String(raw || "").trim().split("?")[0];
    if (!u) continue;
    const key =
      (u.match(/\/kf\/(S[A-Za-z0-9]+)\./i) || [])[1]?.toLowerCase() ||
      u.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // Prefer pk-live CDN when both twins are provided
    const m = u.match(/\/kf\/(S[A-Za-z0-9]+)\.(jpg|jpeg|png|webp)/i);
    out.push(
      m
        ? `https://pk-live-21.slatic.net/kf/${m[1]}.${m[2].toLowerCase()}`
        : u,
    );
  }
  return out;
}

for (const raw of items) {
  const itemId = String(raw.itemId || "").trim();
  const images = dedupeImages(raw.images || []);
  if (!itemId || !images.length) {
    results.push({ itemId, error: "missing itemId or images" });
    continue;
  }

  const longName = brandSafe(raw.name || raw.displayName || `Product ${itemId}`);
  const displayName = brandSafe(raw.displayName || shortDisplayName(longName));
  let slug = slugify(raw.slug || displayName);
  if (!slug) slug = `product-${itemId}`;

  const sale = Number(raw.price);
  const compareRaw = Number(raw.compareAt);
  const compareAt =
    Number.isFinite(compareRaw) && compareRaw > sale ? compareRaw : null;
  if (!Number.isFinite(sale) || sale <= 0) {
    results.push({ itemId, error: "invalid price" });
    continue;
  }

  const collectionSlug = raw.collectionSlug || "home";
  const collectionId = colBySlug[collectionSlug] || null;
  const shortDescription =
    brandSafe(raw.shortDescription) ||
    `${displayName} — everyday essentials from SimpleCart Store. Delivery across Pakistan.`;
  const descriptionHtml =
    brandSafe(raw.descriptionHtml) ||
    defaultDescriptionHtml(displayName, raw.bullets || []);
  const now = new Date().toISOString();
  const stock = Number(raw.stock) > 0 ? Number(raw.stock) : 25;
  const sku = `DARAZ-${itemId}`;
  const tags = [
    collectionSlug,
    `daraz:${itemId}`,
    ...(Array.isArray(raw.tags) ? raw.tags : []),
  ];

  // Skip if this Daraz item already listed (sku or tag)
  const { data: existingBySku } = await sb
    .from("product_variants")
    .select("product_id, sku")
    .eq("sku", sku)
    .maybeSingle();

  let productId = existingBySku?.product_id || null;

  if (!productId) {
    const { data: tagged } = await sb
      .from("products")
      .select("id, tags")
      .contains("tags", [`daraz:${itemId}`])
      .limit(1);
    productId = tagged?.[0]?.id || null;
  }

  // Unique slug if creating new
  if (!productId) {
    const { data: slugHit } = await sb
      .from("products")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (slugHit) slug = `${slug}-${itemId.slice(-4)}`;
  }

  const productPayload = {
    slug,
    name: displayName,
    short_description: shortDescription,
    description: descriptionHtml,
    status: "active",
    images,
    tags,
    stock_total: stock,
    updated_at: now,
  };

  if (productId) {
    const { error } = await sb.from("products").update(productPayload).eq("id", productId);
    if (error) {
      results.push({ itemId, error: error.message });
      continue;
    }
  } else {
    const { data: row, error } = await sb
      .from("products")
      .insert({ ...productPayload, rating: 0, reviews_count: 0 })
      .select("id")
      .single();
    if (error || !row) {
      results.push({ itemId, error: error?.message || "insert failed" });
      continue;
    }
    productId = row.id;
  }

  await sb.from("product_assets").delete().eq("product_id", productId);
  for (let i = 0; i < images.length; i++) {
    const { error } = await sb.from("product_assets").insert({
      product_id: productId,
      url: images[i],
      kind: "image",
      sort_order: i,
      alt_text: displayName,
    });
    if (error) throw new Error(`assets ${itemId}: ${error.message}`);
  }

  const { data: variants } = await sb
    .from("product_variants")
    .select("id")
    .eq("product_id", productId);

  if (variants?.length) {
    for (const v of variants) {
      const { error } = await sb
        .from("product_variants")
        .update({
          sku,
          price: sale,
          compare_at_price: compareAt,
          option_values: {},
        })
        .eq("id", v.id);
      if (error) throw new Error(`variant ${itemId}: ${error.message}`);
    }
  } else {
    const { data: variantRow, error: vErr } = await sb
      .from("product_variants")
      .insert({
        product_id: productId,
        sku,
        option_values: {},
        price: sale,
        compare_at_price: compareAt,
        size_id: null,
        color_id: null,
      })
      .select("id")
      .single();
    if (vErr || !variantRow) throw new Error(vErr?.message || "variant insert");
    await sb.from("inventory").insert({
      product_variant_id: variantRow.id,
      quantity_on_hand: stock,
      quantity_reserved: 0,
      updated_at: now,
    });
  }

  if (collectionId) {
    await sb.from("product_collections").delete().eq("product_id", productId);
    const { error } = await sb.from("product_collections").insert({
      product_id: productId,
      collection_id: collectionId,
    });
    if (error) throw new Error(`collection ${itemId}: ${error.message}`);
  }

  const canonical = `${ORIGIN}/products/${encodeURIComponent(slug)}`;
  const metaTitle = seoTitle(displayName);
  const metaDesc = seoDescription(displayName, shortDescription);
  const keywords = [
    "SimpleCart Store",
    "buy online Pakistan",
    ...displayName.toLowerCase().split(/\s+/).slice(0, 6),
    collectionSlug,
    ...(raw.extraKeywords || []),
  ];
  const uniqueKeywords = [...new Set(keywords.map((k) => String(k).toLowerCase()))].slice(
    0,
    12,
  );

  const { error: seoErr } = await sb.from("seo_meta").upsert(
    {
      subject_type: "product",
      subject_id: productId,
      subject_key: null,
      locale: "en",
      title: metaTitle,
      description: metaDesc,
      keywords: uniqueKeywords,
      canonical_url: canonical,
      og_image_url: images[0],
      og_image_alt: displayName,
      twitter_card: "summary_large_image",
      noindex: false,
      nofollow: false,
      json_ld_overrides: {},
      updated_at: now,
    },
    { onConflict: "subject_type,subject_id,locale" },
  );
  if (seoErr) throw new Error(`seo ${itemId}: ${seoErr.message}`);

  await sb.from("product_shopping_attributes").upsert(
    {
      product_id: productId,
      brand_name: "SimpleCart Store",
      gtin: "",
      mpn: itemId,
      country_of_origin: "PK",
      material: raw.material || "",
      return_policy_id: ret?.id ?? null,
      shipping_policy_id: ship?.id ?? null,
      is_original_imagery: false,
      updated_at: now,
    },
    { onConflict: "product_id" },
  );

  results.push({
    itemId,
    productId,
    slug,
    name: displayName,
    price: sale,
    compareAt,
    images: images.length,
    collection: collectionSlug,
    live: canonical,
  });
  console.log("OK", displayName, sale, compareAt ? `compare ${compareAt}` : "", canonical);
}

const outPath = resolve(root, "scripts/.batch-daraz-list-result.json");
writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log("\nWrote", outPath);
console.log(JSON.stringify(results, null, 2));
