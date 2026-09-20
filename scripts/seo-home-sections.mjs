/**
 * Fill SEO for home_section pages (/s/[slug]) if missing/weak.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://www.simplecartstore.com";
const DEFAULT_OG =
  "https://onmnnxcdwcuegsbvjoqa.supabase.co/storage/v1/object/public/e-commerce-store/seo/og/e72edb9a-79da-4e48-8b66-a72901846ab8.jpg";

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
function clamp(s, max) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, max - 1);
  const cut = slice.lastIndexOf(" ");
  return (cut > Math.floor(max * 0.55) ? slice.slice(0, cut) : slice).trim();
}

const e = loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);

// discover home section table
const candidates = ["home_sections", "homepage_sections", "storefront_sections", "home_rails"];
for (const t of candidates) {
  const { data, error } = await sb.from(t).select("*").limit(3);
  console.log(t, error?.message || `ok ${data?.length}`, data?.[0] ? Object.keys(data[0]) : null);
  if (data?.length) console.log(JSON.stringify(data, null, 2).slice(0, 800));
}
