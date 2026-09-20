/**
 * Attach Daraz review images to matching store reviews.
 * Reads browser CDP export or scripts/.daraz-review-images.json
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
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

const cdpPath =
  "C:/Users/waqar ilyas/.cursor/browser-logs/cdp-response-Runtime.evaluate-2026-08-20T22-03-07-977Z.json";
const outPath = resolve(root, "scripts/.daraz-review-images.json");

let imagesPayload;
if (existsSync(cdpPath)) {
  const raw = JSON.parse(readFileSync(cdpPath, "utf8"));
  const v = raw?.result?.result?.value ?? raw?.result?.value ?? raw?.value;
  imagesPayload = typeof v === "string" ? JSON.parse(v) : v;
  writeFileSync(outPath, JSON.stringify(imagesPayload, null, 2));
} else {
  imagesPayload = JSON.parse(readFileSync(outPath, "utf8"));
}

const e = loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PRODUCT_ID = "c6ebea21-043a-4af0-bcfb-b39138dfe6a7";
const { data: reviews } = await sb
  .from("reviews")
  .select("id, attributed_display_name, body, media")
  .eq("product_id", PRODUCT_ID);

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function bodyKey(s) {
  return norm(s).slice(0, 80);
}

const byNameBody = new Map();
for (const r of reviews || []) {
  byNameBody.set(`${norm(r.attributed_display_name)}|${bodyKey(r.body)}`, r);
}

let updated = 0;
let unmatched = 0;
for (const row of imagesPayload || []) {
  const imgs = (row.images || []).filter((u) => /^https?:\/\//i.test(u)).slice(0, 6);
  if (!imgs.length) continue;
  const key = `${norm(row.reviewer)}|${bodyKey(row.body)}`;
  const match = byNameBody.get(key);
  if (!match) {
    unmatched++;
    continue;
  }
  const media = imgs.map((url) => ({ url, kind: "image" }));
  const { error } = await sb.from("reviews").update({ media }).eq("id", match.id);
  if (error) console.error(error.message);
  else updated++;
}

console.log(JSON.stringify({ updated, unmatched, source: (imagesPayload || []).length }, null, 2));

await fetch("https://www.simplecartstore.com/api/revalidate-review-surface", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ productSlug: "round-glass-cup-with-wooden-lid" }),
}).catch(() => {});
