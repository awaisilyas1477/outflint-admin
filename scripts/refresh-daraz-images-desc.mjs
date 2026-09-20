/**
 * Re-scrape Daraz PDPs for gallery + description only (prices untouched).
 *
 * Usage:
 *   node scripts/refresh-daraz-images-desc.mjs              # thin galleries only
 *   node scripts/refresh-daraz-images-desc.mjs --all         # all daraz-tagged products
 *   node scripts/refresh-daraz-images-desc.mjs --dry-run
 *   node scripts/refresh-daraz-images-desc.mjs --item 1964800958
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");
const ALL = process.argv.includes("--all");
const itemArgIdx = process.argv.indexOf("--item");
const ONLY_ITEM = itemArgIdx >= 0 ? String(process.argv[itemArgIdx + 1] || "").trim() : "";
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

function brandSafe(s) {
  return String(s || "")
    .replace(/\bDaraz\b/gi, "SimpleCart")
    .replace(/\bdaraz\b/gi, "SimpleCart");
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function toDescriptionHtml(text, name) {
  const plain = brandSafe(text).replace(/\s+/g, " ").trim();
  const paras = brandSafe(text)
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p && !/^•\s*$/.test(p));
  const body =
    paras.length > 0
      ? paras
          .map((p) => {
            if (p.includes("\n•") || p.startsWith("•")) {
              const items = p
                .split(/\n+/)
                .map((l) => l.replace(/^•\s*/, "").trim())
                .filter(Boolean);
              if (items.length > 1) {
                return `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
              }
            }
            return `<p>${p.replace(/\n/g, "<br/>")}</p>`;
          })
          .join("")
      : `<p>${plain || name}</p>`;
  return `
${body}
<p>Cash on delivery is available at checkout. Orders are typically packed within 1–2 business days.</p>
<p>Shop with confidence at <strong>SimpleCart Store</strong>.</p>
`.trim();
}

function imageKey(u) {
  const m = String(u).match(/\/kf\/(S[A-Za-z0-9]+)\./i);
  if (m) return m[1].toLowerCase();
  const m2 = String(u).match(/\/p\/([a-f0-9]{16,})/i);
  if (m2) return m2[1].toLowerCase();
  return String(u).split("?")[0].toLowerCase();
}

function normalizeImageUrl(u) {
  const m = String(u || "").match(/\/kf\/(S[A-Za-z0-9]+)\.(jpg|jpeg|png|webp)/i);
  if (m) return `https://pk-live-21.slatic.net/kf/${m[1]}.${m[2].toLowerCase()}`;
  return String(u || "").trim().split("?")[0];
}

function uniqueProductImages(urls) {
  const seen = new Set();
  const out = [];
  for (const raw of urls) {
    const u = normalizeImageUrl(raw);
    if (!u || !/^https?:\/\//i.test(u)) continue;
    if (!/slatic\.net|lazcdn\.com|daraz\.pk/i.test(u)) continue;
    const key = imageKey(u);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out.slice(0, 10);
}

function uniqueImageCount(urls) {
  return new Set((urls || []).map(imageKey).filter(Boolean)).size;
}

async function fetchDarazHtml(itemId) {
  const cleanUrl = `https://www.daraz.pk/products/i${itemId}.html`;
  try {
    const res = await fetch(cleanUrl, {
      headers: { "user-agent": UA, accept: "text/html" },
      redirect: "follow",
    });
    if (res.ok) {
      const t = await res.text();
      if (t.length > 5000 && !/access denied|punish/i.test(t.slice(0, 2000))) return t;
    }
  } catch {
    /* curl fallback */
  }
  const tmp = resolve(tmpdir(), `daraz-refresh-${itemId}-${Date.now()}.html`);
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

function parseDarazMedia(html) {
  if (/access denied|punish/i.test(html.slice(0, 2500))) {
    throw new Error("Daraz blocked");
  }
  let mod = null;
  const modMatch = html.match(/var __moduleData__ = (\{[\s\S]*?\});\s*\n/);
  if (modMatch) {
    try {
      mod = JSON.parse(modMatch[1]);
    } catch {
      /* optional */
    }
  }

  const gallery = [];
  if (mod) {
    const galleries = mod?.data?.root?.fields?.skuGalleries || {};
    const preferred =
      galleries["0"] || galleries[Object.keys(galleries)[0]] || [];
    for (const g of preferred) {
      if (g?.src) gallery.push(g.src);
      if (g?.poster) gallery.push(g.poster);
    }
  }

  const ldMatch = html.match(
    /<script type="application\/ld\+json">\s*(\{"@type":"Product"[\s\S]*?)\s*<\/script>/,
  );
  let ld = null;
  if (ldMatch) {
    try {
      ld = JSON.parse(ldMatch[1]);
    } catch {
      /* optional */
    }
  }
  const ldImages = Array.isArray(ld?.image)
    ? ld.image
    : ld?.image
      ? [ld.image]
      : [];

  const images = uniqueProductImages(gallery.length ? gallery : ldImages);

  const productDesc =
    mod?.data?.root?.fields?.product?.desc ||
    mod?.data?.root?.fields?.product?.highlights ||
    ld?.description ||
    "";
  const plain = stripHtml(productDesc);
  const title = String(ld?.name || mod?.data?.root?.fields?.product?.title || "").trim();

  if (!images.length) throw new Error("No gallery images found");
  return { images, descriptionPlain: plain, title };
}

const e = loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: products, error: pErr } = await sb
  .from("products")
  .select("id,name,slug,status,tags,images,short_description,description")
  .eq("status", "active");
if (pErr) {
  console.error(pErr.message);
  process.exit(1);
}

function darazIdFromProduct(p) {
  const tag = (p.tags || []).find((t) => /^daraz:\d+$/i.test(String(t)));
  if (tag) return String(tag).split(":")[1];
  return null;
}

let targets = (products || []).filter((p) => {
  const id = darazIdFromProduct(p);
  if (!id) return false;
  if (ONLY_ITEM) return id === ONLY_ITEM;
  if (ALL) return true;
  return uniqueImageCount(p.images) <= 2;
});

console.log(
  DRY ? "DRY RUN" : "LIVE",
  ALL ? "all-daraz" : ONLY_ITEM ? `item=${ONLY_ITEM}` : "thin-gallery",
  "targets",
  targets.length,
);

const results = [];
for (let i = 0; i < targets.length; i++) {
  const p = targets[i];
  const itemId = darazIdFromProduct(p);
  process.stdout.write(`[${i + 1}/${targets.length}] ${p.slug} (${itemId}) ... `);
  try {
    const html = await fetchDarazHtml(itemId);
    const scraped = parseDarazMedia(html);
    const short =
      brandSafe(scraped.descriptionPlain).split(/\n/)[0]?.slice(0, 180) ||
      p.short_description ||
      p.name;
    const descriptionHtml = toDescriptionHtml(
      scraped.descriptionPlain || p.name,
      p.name,
    );

    if (!DRY) {
      await sb.from("product_assets").delete().eq("product_id", p.id);
      for (let j = 0; j < scraped.images.length; j++) {
        const { error } = await sb.from("product_assets").insert({
          product_id: p.id,
          url: scraped.images[j],
          kind: "image",
          sort_order: j,
          alt_text: p.name,
        });
        if (error) throw new Error(`asset: ${error.message}`);
      }
      const { error: uErr } = await sb
        .from("products")
        .update({
          images: scraped.images,
          short_description: short,
          description: descriptionHtml,
          updated_at: new Date().toISOString(),
        })
        .eq("id", p.id);
      if (uErr) throw new Error(uErr.message);

      // Keep OG image in sync if seo row exists (ignore if schema differs)
      try {
        await sb
          .from("seo_meta")
          .update({ og_image_url: scraped.images[0] })
          .eq("entity_type", "product")
          .eq("entity_id", p.id);
      } catch {
        /* optional */
      }
    }

    console.log(`ok imgs=${scraped.images.length} descChars=${scraped.descriptionPlain.length}`);
    results.push({
      itemId,
      slug: p.slug,
      images: scraped.images.length,
      ok: true,
    });
  } catch (err) {
    console.log("FAIL", err?.message || err);
    results.push({ itemId, slug: p.slug, ok: false, error: String(err?.message || err) });
  }
  await new Promise((r) => setTimeout(r, 350));
}

const summary = {
  dry: DRY,
  mode: ALL ? "all" : ONLY_ITEM ? "item" : "thin",
  updated: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  results,
};
writeFileSync(
  resolve(root, "scripts/.daraz-images-desc-refresh.json"),
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify({ updated: summary.updated, failed: summary.failed }, null, 2));
