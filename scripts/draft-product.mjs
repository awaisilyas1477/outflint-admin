/**
 * Draft a product by slug.
 * Usage: node scripts/draft-product.mjs <slug>
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

const slug = String(process.argv[2] || "").trim();
if (!slug) {
  console.error("Usage: node scripts/draft-product.mjs <slug>");
  process.exit(1);
}

const e = loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);

const { data: before, error: findErr } = await sb
  .from("products")
  .select("id, name, slug, status")
  .eq("slug", slug)
  .maybeSingle();
if (findErr) throw findErr;
if (!before) {
  console.error("Product not found:", slug);
  process.exit(1);
}

const { data: after, error } = await sb
  .from("products")
  .update({ status: "draft" })
  .eq("id", before.id)
  .select("id, name, slug, status")
  .single();
if (error) throw error;

console.log(JSON.stringify({ before, after }, null, 2));

try {
  await fetch("https://www.simplecartstore.com/api/revalidate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag: "products" }),
  });
  console.log("Cache revalidated");
} catch {
  console.log("Cache revalidate skipped");
}
