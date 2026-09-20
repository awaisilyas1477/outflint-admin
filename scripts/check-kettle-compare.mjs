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
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "").replace(/\s+#.*$/, "");
  }
  return out;
}
const e = loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);
const slug = "imported-electric-kettle-2l-1500w-stainless-steel-with-advanced-automatic-switch";
const { data: p } = await sb.from("products").select("id,name,status").eq("slug", slug).maybeSingle();
console.log("product", p);
const { data: v } = await sb.from("product_variants").select("id,price,compare_at_price").eq("product_id", p.id);
console.log("variants", v);
const { data: d } = await sb.from("products").select("id,name,status,slug").eq("slug", "cartoon-bear-shaped-coffee-mug-cute-bear-mug-glass-cup-with-straw-transparent-cr-pe2l").maybeSingle();
console.log("pe2l product", d);
