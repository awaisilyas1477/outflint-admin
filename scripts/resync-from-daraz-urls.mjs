/**
 * Re-sync catalog from original Daraz URLs:
 * - Real sale price + compare_at (only if Daraz has original > sale)
 * - Replace gallery with Daraz product images
 * - Draft true duplicates (same Daraz item id)
 *
 * Usage: node scripts/resync-from-daraz-urls.mjs [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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

function itemIdFromUrl(u) {
  const m = String(u).match(/-i(\d+)/i);
  return m ? m[1] : null;
}

function uniqueImages(urls) {
  const seen = new Set();
  const out = [];
  for (const raw of urls) {
    const u = String(raw || "").trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function pickProductImages(urls) {
  const staticPk = uniqueImages(urls).filter((u) =>
    /^https:\/\/static-01\.daraz\.pk\/p\/[^"'\\\s]+\.(?:jpg|jpeg|png|webp)/i.test(u),
  );
  if (staticPk.length) return staticPk.slice(0, 8);
  return uniqueImages(urls)
    .filter((u) => /daraz\.pk|lazcdn\.com/i.test(u))
    .slice(0, 8);
}

async function fetchDarazHtml(targetUrl) {
  const cleanUrl = targetUrl.split("?")[0];
  try {
    const res = await fetch(cleanUrl, {
      headers: { "user-agent": UA, accept: "text/html" },
      redirect: "follow",
    });
    if (res.ok) {
      const t = await res.text();
      if (t.length > 2000) return t;
    }
  } catch {
    /* curl fallback */
  }
  const tmp = resolve(tmpdir(), `daraz-resync-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  try {
    execSync(`curl.exe -sL -A "${UA}" "${cleanUrl}" -o "${tmp}"`, {
      stdio: "pipe",
      timeout: 120_000,
    });
    return readFileSync(tmp, "utf8");
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

function parseDarazProduct(html, sourceUrl) {
  const ldMatch = html.match(
    /<script type="application\/ld\+json">\s*(\{"@type":"Product"[\s\S]*?)\s*<\/script>/,
  );
  if (!ldMatch) throw new Error("Product JSON-LD not found");

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

  // Prefer skuGalleries over JSON-LD images — LD often reuses another listing's primary.
  const galleryFromMod = [];
  if (mod) {
    try {
      const galleries = mod?.data?.root?.fields?.skuGalleries || {};
      const skuFromUrl = (String(sourceUrl).match(/-s(\d+)/i) || [])[1];
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

  const itemId = itemIdFromUrl(sourceUrl);
  return {
    sourceUrl,
    itemId,
    name: String(productLd.name || "").trim(),
    price: price ?? 0,
    compareAt: compareAt && compareAt > (price ?? 0) ? compareAt : null,
    images,
    sku: String(productLd.sku || productLd.mpn || "").trim(),
  };
}

const e = loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);

const urls = JSON.parse(readFileSync(resolve(root, "scripts/.daraz-source-urls.json"), "utf8"));
console.log(DRY ? "DRY RUN" : "LIVE", "urls", urls.length);

// Load active (+ draft that look like dups) products
const { data: products } = await sb
  .from("products")
  .select("id,name,slug,status")
  .in("status", ["active", "draft"]);
const pids = products.map((p) => p.id);
const { data: variants } = await sb
  .from("product_variants")
  .select("id,product_id,sku,price,compare_at_price")
  .in("product_id", pids);
const varsBy = new Map();
for (const v of variants || []) {
  if (!varsBy.has(v.product_id)) varsBy.set(v.product_id, []);
  varsBy.get(v.product_id).push(v);
}

function findProductsForItemId(itemId) {
  if (!itemId) return [];
  return products.filter((p) => {
    const vs = varsBy.get(p.id) || [];
    return vs.some((v) => String(v.sku || "").includes(itemId));
  });
}

const scraped = [];
const scrapeErrors = [];
for (let i = 0; i < urls.length; i++) {
  const u = urls[i];
  process.stdout.write(`[${i + 1}/${urls.length}] ${u} ... `);
  try {
    const html = await fetchDarazHtml(u);
    const data = parseDarazProduct(html, u);
    scraped.push(data);
    console.log(`ok price=${data.price} cmp=${data.compareAt ?? "-"} imgs=${data.images.length}`);
  } catch (err) {
    scrapeErrors.push({ url: u, error: String(err?.message || err) });
    console.log("FAIL", err?.message || err);
  }
  // polite delay
  await new Promise((r) => setTimeout(r, 400));
}

writeFileSync(
  resolve(root, "scripts/.daraz-rescrape.json"),
  JSON.stringify({ scraped, scrapeErrors }, null, 2),
);

const stats = {
  synced: 0,
  draftedExtras: 0,
  unmatchedUrls: [],
  compareSet: 0,
  compareCleared: 0,
  imagesReplaced: 0,
  errors: [],
};

const claimedProductIds = new Set();

for (const row of scraped) {
  const matches = findProductsForItemId(row.itemId).filter((p) => !claimedProductIds.has(p.id));
  if (!matches.length) {
    stats.unmatchedUrls.push({ url: row.sourceUrl, itemId: row.itemId, name: row.name });
    continue;
  }

  // Prefer currently active, then most images later — sort active first, oldest first
  matches.sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    return String(a.slug).localeCompare(String(b.slug));
  });
  const keep = matches[0];
  const extras = matches.slice(1);
  claimedProductIds.add(keep.id);

  for (const extra of extras) {
    claimedProductIds.add(extra.id);
    if (extra.status === "active") {
      if (!DRY) {
        const { error } = await sb
          .from("products")
          .update({ status: "draft", updated_at: new Date().toISOString() })
          .eq("id", extra.id);
        if (error) stats.errors.push(`draft ${extra.id}: ${error.message}`);
        else stats.draftedExtras++;
      } else stats.draftedExtras++;
    }
  }

  const vs = varsBy.get(keep.id) || [];
  const primary = vs[0];
  if (primary && row.price > 0) {
    const patch = {
      price: row.price,
      compare_at_price: row.compareAt, // null clears fake markups
    };
    if (row.compareAt) stats.compareSet++;
    else stats.compareCleared++;
    if (!DRY) {
      const { error } = await sb.from("product_variants").update(patch).eq("id", primary.id);
      if (error) stats.errors.push(`price ${keep.id}: ${error.message}`);
    }
  }

  if (row.images.length) {
    stats.imagesReplaced++;
    if (!DRY) {
      await sb.from("product_assets").delete().eq("product_id", keep.id);
      for (let i = 0; i < row.images.length; i++) {
        const { error } = await sb.from("product_assets").insert({
          product_id: keep.id,
          url: row.images[i],
          kind: "image",
          sort_order: i,
          alt_text: keep.name,
        });
        if (error) stats.errors.push(`img ${keep.id}: ${error.message}`);
      }
      await sb.from("products").update({ images: row.images }).eq("id", keep.id);
    }
  }
  stats.synced++;
  console.log(
    `SYNC ${keep.name} ← item ${row.itemId} price=${row.price} cmp=${row.compareAt ?? "null"} imgs=${row.images.length} extrasDrafted=${extras.length}`,
  );
}

// Clear synthetic compare_at on active products that were NOT matched to a Daraz URL
// (leave price alone; only wipe compare if we didn't sync them — actually user wants
 // compare according to links. Unmatched should have compare null.)
const { data: activeNow } = await sb.from("products").select("id,name").eq("status", "active");
for (const p of activeNow || []) {
  if (claimedProductIds.has(p.id)) continue;
  const vs = varsBy.get(p.id) || [];
  for (const v of vs) {
    if (v.compare_at_price == null) continue;
    // Only clear if this looks like our synthetic markup (~22%)
    const price = Number(v.price) || 0;
    const cmp = Number(v.compare_at_price) || 0;
    if (!(cmp > price)) continue;
    const ratio = cmp / price;
    if (ratio >= 1.15 && ratio <= 1.3) {
      if (!DRY) {
        await sb.from("product_variants").update({ compare_at_price: null }).eq("id", v.id);
      }
      stats.compareCleared++;
      console.log(`CLEAR synthetic compare on unmatched ${p.name}`);
    }
  }
}

const summary = { dry: DRY, stats, scrapeErrors: scrapeErrors.length, scraped: scraped.length };
writeFileSync(resolve(root, "scripts/.daraz-resync-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
