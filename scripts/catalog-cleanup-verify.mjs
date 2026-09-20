/**
 * Post-cleanup verification.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
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
const e = loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);

const { data: active } = await sb.from("products").select("id,name,slug").eq("status", "active");
const { data: draft } = await sb.from("products").select("id,name,slug").eq("status", "draft");
const ids = active.map((p) => p.id);

const { data: variants } = await sb
  .from("product_variants")
  .select("product_id,price,compare_at_price")
  .in("product_id", ids);
const { data: assets } = await sb
  .from("product_assets")
  .select("product_id,url")
  .in("product_id", ids);

const urlMap = new Map();
const imgCount = new Map();
for (const a of assets || []) {
  imgCount.set(a.product_id, (imgCount.get(a.product_id) || 0) + 1);
  if (!a.url) continue;
  if (!urlMap.has(a.url)) urlMap.set(a.url, new Set());
  urlMap.get(a.url).add(a.product_id);
}
const shared = [...urlMap.entries()].filter(([, s]) => s.size > 1);
const zeroImg = active.filter((p) => !(imgCount.get(p.id) > 0));

let withCmp = 0;
for (const p of active) {
  const vs = variants.filter((v) => v.product_id === p.id);
  if (vs.some((v) => v.compare_at_price != null && Number(v.compare_at_price) > Number(v.price)))
    withCmp++;
}

// fingerprint dups remaining
function fp(pid) {
  const first = (assets || []).find((a) => a.product_id === pid)?.url || "";
  const file = first.split("/").pop()?.split("?")[0] || "";
  const price = variants.find((v) => v.product_id === pid)?.price ?? 0;
  return `${file}|${price}`;
}
const byFp = new Map();
for (const p of active) {
  const k = fp(p.id);
  if (!byFp.has(k)) byFp.set(k, []);
  byFp.get(k).push(p.name);
}
const fpDups = [...byFp.entries()].filter(([, g]) => g.length > 1);

console.log(
  JSON.stringify(
    {
      active: active.length,
      draft: draft.length,
      draftNames: draft.map((d) => d.name),
      productsWithCompareAt: withCmp,
      withoutCompareAt: active.length - withCmp,
      sharedImageUrlGroups: shared.length,
      productsWithZeroImages: zeroImg.map((p) => p.name),
      remainingFingerprintDups: fpDups,
      sampleCompare: variants
        .filter((v) => v.compare_at_price > v.price)
        .slice(0, 5)
        .map((v) => {
          const p = active.find((x) => x.id === v.product_id);
          return { name: p?.name, price: v.price, compare_at: v.compare_at_price };
        }),
    },
    null,
    2,
  ),
);
