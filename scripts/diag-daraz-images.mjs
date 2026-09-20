/**
 * Diagnose image sources for products that share primary images.
 */
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const urls = [
  "https://www.daraz.pk/products/1-i947154552-s4010993449.html",
  "https://www.daraz.pk/products/12-16-i947142723-s4010993194.html",
  "https://www.daraz.pk/products/-i915817039-s3964281813.html",
  "https://www.daraz.pk/products/-i563842089-s3964304190.html",
];

function fetchHtml(url) {
  const tmp = resolve(tmpdir(), `diag-${Date.now()}.html`);
  execSync(`curl.exe -sL -A "${UA}" "${url}" -o "${tmp}"`, { timeout: 120000, stdio: "pipe" });
  const html = readFileSync(tmp, "utf8");
  unlinkSync(tmp);
  return html;
}

const out = [];
for (const url of urls) {
  const html = fetchHtml(url);
  const ldMatch = html.match(
    /<script type="application\/ld\+json">\s*(\{"@type":"Product"[\s\S]*?)\s*<\/script>/,
  );
  const productLd = ldMatch ? JSON.parse(ldMatch[1]) : null;
  const modMatch = html.match(/var __moduleData__ = (\{[\s\S]*?\});\s*\n/);
  let galleryKeys = [];
  let gallery0 = [];
  let skuPrice = null;
  if (modMatch) {
    const mod = JSON.parse(modMatch[1]);
    const fields = mod?.data?.root?.fields || {};
    const galleries = fields.skuGalleries || {};
    galleryKeys = Object.keys(galleries);
    const g0 = galleries["0"] || galleries[galleryKeys[0]] || [];
    gallery0 = g0.slice(0, 5).map((g) => g?.src || g?.poster).filter(Boolean);
    const skuInfos = fields.skuInfos || {};
    const first = Object.values(skuInfos)[0];
    skuPrice = first?.price || null;
  }
  const ldImgs = Array.isArray(productLd?.image)
    ? productLd.image.slice(0, 5)
    : productLd?.image
      ? [productLd.image]
      : [];
  out.push({
    url,
    name: productLd?.name?.slice(0, 80),
    ldImgs,
    galleryKeys: galleryKeys.slice(0, 10),
    gallery0,
    skuPrice,
  });
  console.log("---", url);
  console.log("LD", ldImgs[0]);
  console.log("G0", gallery0[0]);
  console.log("keys", galleryKeys.slice(0, 5));
}

writeFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), ".image-diag.json"),
  JSON.stringify(out, null, 2),
);
