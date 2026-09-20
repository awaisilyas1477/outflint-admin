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
const e = load(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);
const r = await sb.from("products").select("id,name,status", { count: "exact" }).limit(8);
console.log(JSON.stringify({ count: r.count, err: r.error, sample: r.data }, null, 2));
const a = await sb.from("products").select("id", { count: "exact", head: true }).eq("status", "active");
const d = await sb.from("products").select("id", { count: "exact", head: true }).eq("status", "draft");
console.log("active", a.count, a.error);
console.log("draft", d.count, d.error);
const cmp = await sb
  .from("product_variants")
  .select("price,compare_at_price,sku")
  .not("compare_at_price", "is", null)
  .limit(10);
console.log("with compare", cmp.data?.length, cmp.error);
const v = await sb.from("product_variants").select("price,compare_at_price,sku").limit(5);
console.log("variant sample", v.data);
