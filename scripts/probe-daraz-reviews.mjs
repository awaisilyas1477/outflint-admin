/**
 * Probe Daraz HTML/API for review fields on one product.
 * Usage: node scripts/probe-daraz-reviews.mjs [url]
 */
import { execSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const url =
  process.argv[2] ||
  "https://www.daraz.pk/products/-i563842089-s3964304190.html";

const tmp = resolve(tmpdir(), `daraz-rev-${Date.now()}.html`);
execSync(`curl.exe -sL -A "${UA}" "${url.split("?")[0]}" -o "${tmp}"`, {
  timeout: 120000,
  stdio: "pipe",
});
const html = readFileSync(tmp, "utf8");
unlinkSync(tmp);

const out = { htmlLen: html.length, hits: {}, sample: {} };

for (const key of [
  "ratingScore",
  "reviewCount",
  "totalReviews",
  "rateContent",
  "buyerName",
  "reviewContent",
  "aggregateRating",
  "review",
  "ratings",
]) {
  const re = new RegExp(key, "gi");
  const n = (html.match(re) || []).length;
  out.hits[key] = n;
}

const modMatch = html.match(/var __moduleData__ = (\{[\s\S]*?\});\s*\n/);
if (modMatch) {
  const mod = JSON.parse(modMatch[1]);
  const fields = mod?.data?.root?.fields || {};
  out.sample.fieldKeys = Object.keys(fields).slice(0, 80);
  // walk for rating-like keys
  const found = [];
  const walk = (obj, path, depth = 0) => {
    if (!obj || typeof obj !== "object" || depth > 6 || found.length > 40) return;
    for (const [k, v] of Object.entries(obj)) {
      const p = path ? `${path}.${k}` : k;
      if (/rating|review/i.test(k)) {
        found.push({
          path: p,
          type: Array.isArray(v) ? `array(${v.length})` : typeof v,
          preview:
            typeof v === "string" || typeof v === "number"
              ? v
              : Array.isArray(v)
                ? v.slice(0, 1)
                : v && typeof v === "object"
                  ? Object.keys(v).slice(0, 12)
                  : v,
        });
      }
      if (v && typeof v === "object") walk(v, p, depth + 1);
    }
  };
  walk(fields, "fields");
  out.sample.ratingPaths = found;

  // common lazada paths
  const candidates = [
    fields.review,
    fields.productReview,
    fields.product?.review,
    fields.skuInfos && Object.values(fields.skuInfos)[0],
  ];
  out.sample.reviewTop = candidates.map((c) =>
    c && typeof c === "object" ? Object.keys(c).slice(0, 20) : c,
  );
}

// find review API urls in page
const apiUrls = [...html.matchAll(/https?:\/\/[^"'\\\s]+review[^"'\\\s]*/gi)]
  .map((m) => m[0])
  .slice(0, 20);
out.apiUrls = [...new Set(apiUrls)];

const root = resolve(dirname(fileURLToPath(import.meta.url)));
writeFileSync(resolve(root, ".daraz-review-probe.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
