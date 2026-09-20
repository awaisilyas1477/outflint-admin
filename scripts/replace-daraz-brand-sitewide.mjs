/**
 * Replace customer-facing "Daraz" → "SimpleCart" in products + reviews.
 * Usage: node scripts/replace-daraz-brand-sitewide.mjs
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

function brandSafe(s) {
  return String(s || "")
    .replace(/\bDaraz\b/gi, "SimpleCart")
    .replace(/\bdaraz\b/gi, "SimpleCart");
}

function needsReplace(s) {
  return /\bdaraz\b/i.test(String(s || ""));
}

const e = load(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const fields = ["name", "short_description", "description"];

let productUpdates = 0;
const { data: products, error: pErr } = await sb
  .from("products")
  .select(`id, slug, ${fields.join(", ")}`)
  .or(fields.map((f) => `${f}.ilike.%daraz%`).join(","));
if (pErr) throw new Error(pErr.message);

for (const p of products || []) {
  const patch = {};
  for (const f of fields) {
    if (needsReplace(p[f])) patch[f] = brandSafe(p[f]);
  }
  if (!Object.keys(patch).length) continue;
  const { error } = await sb.from("products").update(patch).eq("id", p.id);
  if (error) throw new Error(`${p.slug}: ${error.message}`);
  productUpdates += 1;
  console.log(`product ${p.slug}`);
}

let seoUpdates = 0;
const { data: seoRows, error: seoErr } = await sb
  .from("seo_meta")
  .select("id, subject_type, subject_id, title, description")
  .or("title.ilike.%daraz%,description.ilike.%daraz%");
if (seoErr) throw new Error(seoErr.message);
for (const row of seoRows || []) {
  const patch = {};
  if (needsReplace(row.title)) patch.title = brandSafe(row.title);
  if (needsReplace(row.description)) patch.description = brandSafe(row.description);
  if (!Object.keys(patch).length) continue;
  const { error } = await sb.from("seo_meta").update(patch).eq("id", row.id);
  if (error) throw new Error(`seo ${row.id}: ${error.message}`);
  seoUpdates += 1;
}

let reviewUpdates = 0;
let from = 0;
const page = 500;
for (;;) {
  const { data: rows, error } = await sb
    .from("reviews")
    .select("id, body, title")
    .or("body.ilike.%daraz%,title.ilike.%daraz%")
    .range(from, from + page - 1);
  if (error) throw new Error(error.message);
  if (!rows?.length) break;
  for (const r of rows) {
    const patch = {};
    if (needsReplace(r.body)) patch.body = brandSafe(r.body);
    if (needsReplace(r.title) && !String(r.title).startsWith("daraz:")) {
      patch.title = brandSafe(r.title);
    }
    if (!Object.keys(patch).length) continue;
    const { error: uErr } = await sb.from("reviews").update(patch).eq("id", r.id);
    if (uErr) throw new Error(uErr.message);
    reviewUpdates += 1;
  }
  if (rows.length < page) break;
  from += page;
}

console.log(JSON.stringify({ productUpdates, seoUpdates, reviewUpdates }, null, 2));
