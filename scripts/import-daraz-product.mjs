/**
 * One-off Daraz → SimpleCartStore product import (external image URLs, full SEO).
 * Usage: node scripts/import-daraz-product.mjs <daraz-product-url>
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

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
const storefrontOrigin = (
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

const darazUrl = process.argv[2];
if (!darazUrl) {
  console.error("Usage: node scripts/import-daraz-product.mjs <daraz-url>");
  process.exit(1);
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toDescriptionHtml(text) {
  const paras = text.split(/\n\n+/).filter(Boolean);
  if (!paras.length) return "<p></p>";
  return paras.map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`).join("");
}

function seoTitle(name) {
  // Store product-focused title; storefront appends "| SimpleCart Store".
  const base = `${name} – Buy Online PK`;
  return base.length <= 58 ? base : `${name.slice(0, 55).trim()}…`;
}

function seoDescription(name, short) {
  const lead =
    `Buy ${name} online at SimpleCart Store. ${short} Fast delivery across Pakistan.`
      .replace(/\s+/g, " ")
      .trim();
  return lead.length <= 158 ? lead : `${lead.slice(0, 155).trim()}…`;
}

/** Prefer a clean short display title for PDP H1 / cards (max ~52 chars). */
function shortDisplayName(name) {
  const cleaned = String(name || "")
    .replace(/\b(high quality|imported|best quality|hot selling|premium)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= 52) return cleaned;
  const slice = cleaned.slice(0, 51);
  const cut = slice.lastIndexOf(" ");
  return (cut > 20 ? slice.slice(0, cut) : slice).trim();
}

function uniqueImages(urls) {
  const seen = new Set();
  const out = [];
  for (const raw of urls) {
    const u = raw.trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function pickProductImages(urls) {
  const staticPk = uniqueImages(urls).filter((u) =>
    /^https:\/\/static-01\.daraz\.pk\/p\/[^"'\\s]+\.(?:jpg|jpeg|png|webp)/i.test(u),
  );
  if (staticPk.length) return staticPk.slice(0, 8);
  return uniqueImages(urls)
    .filter((u) => /daraz\.pk|lazcdn\.com/i.test(u))
    .slice(0, 8);
}

async function fetchDarazHtml(targetUrl) {
  const htmlFile = process.env.DARAZ_HTML_FILE?.trim();
  if (htmlFile && existsSync(htmlFile)) {
    return readFileSync(htmlFile, "utf8");
  }
  const cleanUrl = targetUrl.split("?")[0];
  try {
    const res = await fetch(cleanUrl, {
      headers: { "user-agent": UA, accept: "text/html" },
      redirect: "follow",
    });
    if (res.ok) return res.text();
  } catch {
    /* fall through to curl */
  }
  const tmp = resolve(tmpdir(), `daraz-${Date.now()}.html`);
  try {
    execSync(
      `curl.exe -sL -A "${UA}" "${cleanUrl}" -o "${tmp}"`,
      { stdio: "pipe", timeout: 120_000 },
    );
    if (!existsSync(tmp) || readFileSync(tmp, "utf8").length < 1000) {
      throw new Error("Daraz page download failed (curl).");
    }
    return readFileSync(tmp, "utf8");
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

function parseDarazProduct(html, sourceUrl = "") {
  const ldMatch = html.match(
    /<script type="application\/ld\+json">\s*(\{"@type":"Product"[\s\S]*?)\s*<\/script>/,
  );
  if (!ldMatch) throw new Error("Product JSON-LD not found on Daraz page.");

  const productLd = JSON.parse(ldMatch[1]);
  let price = null;
  let compareAt = null;
  let mod = null;

  const modMatch = html.match(/var __moduleData__ = (\{[\s\S]*?\});\s*\n/);
  if (modMatch) {
    try {
      mod = JSON.parse(modMatch[1]);
      const skuInfos =
        mod?.data?.root?.fields?.skuInfos ||
        mod?.data?.root?.fields?.primaryKey?.skuInfos ||
        mod?.data?.root?.fields?.product?.skuInfos ||
        {};
      const firstSku = Object.values(skuInfos)[0];
      if (firstSku?.price?.salePrice?.value != null) {
        price = Number(firstSku.price.salePrice.value);
      }
      if (firstSku?.price?.originalPrice?.value != null) {
        compareAt = Number(firstSku.price.originalPrice.value);
      }
    } catch {
      /* optional */
    }
  }

  if (productLd.offers?.price != null && price == null) {
    price = Number(productLd.offers.price);
  }

  if (price == null) {
    const trackMatch = html.match(/"pdt_price":"Rs\.\s*([\d,]+(?:\.\d+)?)"/);
    if (trackMatch) {
      const num = Number(trackMatch[1].replace(/,/g, ""));
      if (num > 0) price = num;
    }
  }

  if (price == null) {
    const rsMatch = html.match(/Rs\.\s*([\d,]+(?:\.\d+)?)/i);
    if (rsMatch) {
      const num = Number(rsMatch[1].replace(/,/g, ""));
      if (num > 0) price = num;
    }
  }

  // Prefer skuGalleries over JSON-LD — LD primary is often shared across unrelated listings.
  const galleryFromMod = [];
  if (mod) {
    try {
      const galleries = mod?.data?.root?.fields?.skuGalleries || {};
      const skuFromUrl = (String(sourceUrl || "").match(/-s(\d+)/i) || [])[1];
      const preferred =
        (skuFromUrl && galleries[skuFromUrl]) ||
        galleries["0"] ||
        galleries[Object.keys(galleries)[0]] ||
        [];
      for (const g of preferred) {
        if (g?.src) galleryFromMod.push(g.src);
        if (g?.poster) galleryFromMod.push(g.poster);
      }
    } catch {
      /* optional */
    }
  }

  const ldImages = Array.isArray(productLd.image)
    ? productLd.image
    : productLd.image
      ? [productLd.image]
      : [];
  const images = pickProductImages(
    galleryFromMod.length ? galleryFromMod : ldImages,
  );

  const plainDesc = brandSafeText(stripHtml(String(productLd.description || "")));
  const rawName = brandSafeText(String(productLd.name || "").trim());
  const short =
    plainDesc.split(/\n/)[0]?.slice(0, 180) || rawName;

  return {
    name: rawName,
    descriptionPlain: plainDesc,
    shortDescription: short,
    descriptionHtml: toDescriptionHtml(plainDesc),
    price: price ?? 0,
    compareAt: compareAt && compareAt > (price ?? 0) ? compareAt : null,
    images,
    sku: String(productLd.sku || productLd.mpn || "").trim(),
    brand: "SimpleCartStore",
    category: productLd.category || "",
  };
}

/** Customer-facing copy: never show Daraz on SimpleCart. */
function brandSafeText(s) {
  return String(s || "")
    .replace(/\bDaraz\b/gi, "SimpleCart")
    .replace(/\bdaraz\b/gi, "SimpleCart");
}

async function getPolicyIds(sb) {
  const { data } = await sb.from("policy_pages").select("id, slug").in("slug", [
    "return-policy",
    "shipping-policy",
  ]);
  const map = Object.fromEntries((data ?? []).map((r) => [r.slug, r.id]));
  return {
    returnPolicyId: map["return-policy"] ?? null,
    shippingPolicyId: map["shipping-policy"] ?? null,
  };
}

async function importProduct(sb, scraped) {
  let slug = slugify(scraped.name);
  if (!slug) slug = `product-${Date.now()}`;

  const { data: existing } = await sb.from("products").select("id, slug").eq("slug", slug).maybeSingle();
  if (existing) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  }

  const imageUrls = scraped.images.length ? scraped.images : [];
  // Block re-import of the same Daraz listing (same primary image already on an active product).
  if (imageUrls[0]) {
    const { data: assetHits } = await sb
      .from("product_assets")
      .select("product_id")
      .eq("url", imageUrls[0])
      .limit(20);
    const candidateIds = [...new Set((assetHits || []).map((r) => r.product_id).filter(Boolean))];
    if (candidateIds.length) {
      const { data: activeHits } = await sb
        .from("products")
        .select("id,name")
        .in("id", candidateIds)
        .eq("status", "active")
        .limit(1);
      if (activeHits?.length) {
        throw new Error(
          `Duplicate skip: primary image already used by active product "${activeHits[0].name}" (${activeHits[0].id}).`,
        );
      }
    }
  }

  const now = new Date().toISOString();
  const stock = 25;
  const displayName = shortDisplayName(scraped.name);

  // Only use Daraz originalPrice when it is higher than sale — never invent compare-at.
  const compareAt =
    scraped.compareAt != null && scraped.compareAt > scraped.price
      ? scraped.compareAt
      : null;

  const { data: prodRow, error: pErr } = await sb
    .from("products")
    .insert({
      slug,
      name: displayName,
      short_description:
        scraped.shortDescription ||
        `${displayName} — everyday essentials from SimpleCart Store. Delivery across Pakistan.`,
      description: scraped.descriptionHtml,
      status: "active",
      images: imageUrls,
      tags: [],
      rating: 0,
      reviews_count: 0,
      stock_total: stock,
      updated_at: now,
    })
    .select("id")
    .single();

  if (pErr || !prodRow) throw new Error(pErr?.message ?? "Product insert failed");
  const productId = prodRow.id;

  await sb.from("product_assets").delete().eq("product_id", productId);
  for (let i = 0; i < imageUrls.length; i++) {
    const { error } = await sb.from("product_assets").insert({
      product_id: productId,
      url: imageUrls[i],
      kind: "image",
      sort_order: i,
      alt_text: displayName,
    });
    if (error) throw new Error(`product_assets: ${error.message}`);
  }

  const skuBase = (scraped.sku || slug).replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 100);
  const { data: variantRow, error: vErr } = await sb
    .from("product_variants")
    .insert({
      product_id: productId,
      sku: skuBase || `${slug}-001`,
      option_values: {},
      price: scraped.price > 0 ? scraped.price : 999,
      compare_at_price: compareAt,
      size_id: null,
      color_id: null,
    })
    .select("id")
    .single();
  if (vErr || !variantRow) throw new Error(vErr?.message ?? "Variant insert failed");

  const { error: invErr } = await sb.from("inventory").insert({
    product_variant_id: variantRow.id,
    quantity_on_hand: stock,
    quantity_reserved: 0,
    updated_at: now,
  });
  if (invErr) throw new Error(`inventory: ${invErr.message}`);

  const canonical = `${storefrontOrigin}/products/${encodeURIComponent(slug)}`;
  const metaTitle = seoTitle(displayName);
  const metaDesc = seoDescription(displayName, scraped.shortDescription);
  const keywords = [
    "SimpleCart Store",
    "buy online Pakistan",
    ...displayName.split(/\s+/).slice(0, 6),
    ...(scraped.category ? scraped.category.split(">").map((s) => s.trim()) : []),
  ]
    .map((k) => k.toLowerCase())
    .filter(Boolean);
  const uniqueKeywords = [...new Set(keywords)].slice(0, 12);

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
      og_image_url: imageUrls[0] ?? "",
      og_image_alt: displayName,
      og_image_width: null,
      og_image_height: null,
      twitter_card: "summary_large_image",
      noindex: false,
      nofollow: false,
      json_ld_overrides: {},
      updated_at: now,
    },
    { onConflict: "subject_type,subject_id,locale" },
  );
  if (seoErr) throw new Error(`seo_meta: ${seoErr.message}`);

  const policies = await getPolicyIds(sb);
  const { error: shopErr } = await sb.from("product_shopping_attributes").upsert(
    {
      product_id: productId,
      brand_name: "SimpleCart Store",
      gtin: "",
      mpn: scraped.sku || "",
      country_of_origin: "PK",
      material: "",
      return_policy_id: policies.returnPolicyId,
      shipping_policy_id: policies.shippingPolicyId,
      is_original_imagery: false,
      updated_at: now,
    },
    { onConflict: "product_id" },
  );
  if (shopErr) throw new Error(`product_shopping_attributes: ${shopErr.message}`);

  return { productId, slug, canonical, imageCount: imageUrls.length, price: scraped.price };
}

async function main() {
  console.log("Fetching Daraz page…");
  const html = await fetchDarazHtml(darazUrl);
  const scraped = parseDarazProduct(html, darazUrl);
  console.log("Parsed:", scraped.name);
  console.log("Price:", scraped.price, "Images:", scraped.images.length);

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await importProduct(sb, scraped);
  console.log("\nImported successfully:");
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nLive: ${result.canonical}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
