import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

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

const { data: v, error } = await sb
  .from("seo_search_engine_verifications")
  .select(
    "google_site_verification, bing_site_verification, facebook_domain_verification, pinterest_site_verification, yandex_site_verification",
  )
  .eq("id", 1)
  .maybeSingle();
if (error) throw error;

const google = (v?.google_site_verification || "").trim();
const bing = (v?.bing_site_verification || "").trim();

console.log("DB google set:", Boolean(google));
console.log("DB google value:", google ? `${google.slice(0, 12)}…(${google.length} chars)` : "(empty)");
console.log("DB bing set:", Boolean(bing));

const html = await (await fetch("https://www.simplecartstore.com/", { cache: "no-store" })).text();
const metaGoogle =
  (html.match(/name=["']google-site-verification["']\s+content=["']([^"']+)["']/i) ||
    html.match(/content=["']([^"']+)["']\s+name=["']google-site-verification["']/i) ||
    [])[1] || "";

console.log("Live meta google-site-verification:", metaGoogle ? `${metaGoogle.slice(0, 12)}…(${metaGoogle.length} chars)` : "(missing)");
console.log("DB matches live:", Boolean(google) && google === metaGoogle);

const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1];
console.log("Live title:", title);
