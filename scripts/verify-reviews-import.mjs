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
const pid = "c6ebea21-043a-4af0-bcfb-b39138dfe6a7";
const { data: p } = await sb.from("products").select("name,rating,reviews_count").eq("id", pid).single();
const { count } = await sb
  .from("reviews")
  .select("id", { count: "exact", head: true })
  .eq("product_id", pid)
  .eq("status", "approved");
const { data: sample } = await sb
  .from("reviews")
  .select("attributed_display_name,rating,body,created_at,title")
  .eq("product_id", pid)
  .order("created_at", { ascending: false })
  .limit(5);
console.log(JSON.stringify({ product: p, approvedCount: count, sample }, null, 2));
