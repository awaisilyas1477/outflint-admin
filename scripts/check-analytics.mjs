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
const { data } = await sb
  .from("seo_analytics")
  .select("google_analytics_id, google_tag_manager_id, meta_pixel_id, consent_required")
  .eq("id", 1)
  .maybeSingle();
console.log(data);

const html = await (await fetch("https://www.simplecartstore.com/", { cache: "no-store" })).text();
const hasGtm = /GTM-[A-Z0-9]+/i.test(html);
const gtmMatch = html.match(/GTM-[A-Z0-9]+/i);
const hasGa = /G-[A-Z0-9]+/i.test(html) || /gtag\/js\?id=/i.test(html);
console.log({
  liveGtm: gtmMatch?.[0] || null,
  hasGtmScript: hasGtm,
  hasGaScript: hasGa,
});
