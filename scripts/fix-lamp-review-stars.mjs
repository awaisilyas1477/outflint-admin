/**
 * Fix lamp review star ratings + missing dates, then re-import.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = resolve(root, "scripts/.daraz-reviews-911993176.json");

const data = JSON.parse(readFileSync(jsonPath, "utf8"));

/** Known accurate overrides from Daraz DOM re-scrape (mask-based stars + dates). */
const DATE_FIX = {
  "Muhammad U.": "19 Jul 2026",
  "Muhammad Hasnain": "01 Sep 2025",
  "Ayan Shayan195": "04 Jul 2026",
};

for (const r of data.reviews) {
  if (DATE_FIX[r.reviewer] && !r.reviewTime) {
    r.reviewTime = DATE_FIX[r.reviewer];
  }
  // Explicit date fixes even if present wrong
  if (DATE_FIX[r.reviewer]) {
    r.reviewTime = DATE_FIX[r.reviewer];
  }
  // Accurate star: disappointed remote complaint is 1★ on Daraz
  if (
    /madhy\s*z/i.test(r.reviewer) ||
    (/remote not work/i.test(r.reviewContent) &&
      /disappointed/i.test(r.reviewContent))
  ) {
    r.rating = 1;
  }
  r.reviewContent = String(r.reviewContent || "")
    .replace(/\bDaraz\b/gi, "SimpleCart")
    .replace(/\bdaraz\b/gi, "SimpleCart")
    .replace(/\bdarz\b/gi, "SimpleCart")
    .replace(/\bdraz\b/gi, "SimpleCart");
}

const dist = {};
for (const r of data.reviews) {
  dist[r.rating] = (dist[r.rating] || 0) + 1;
}
writeFileSync(jsonPath, JSON.stringify(data, null, 2));
console.log(JSON.stringify({ count: data.reviews.length, dist }, null, 2));

const run = spawnSync(
  process.execPath,
  [
    resolve(root, "scripts/import-daraz-reviews.mjs"),
    jsonPath,
    "rgb-crystal-diamond-table-lamp",
  ],
  { stdio: "inherit", cwd: root },
);
if (run.status !== 0) process.exit(run.status || 1);

const run2 = spawnSync(process.execPath, [resolve(root, "scripts/set-lamp-rating.mjs")], {
  stdio: "inherit",
  cwd: root,
});
process.exit(run2.status || 0);
