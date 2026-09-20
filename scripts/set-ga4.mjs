/**
 * Set GA4 Measurement ID in seo_analytics (used by storefront layout).
 * Usage: node scripts/set-ga4.mjs G-XXXXXXXX
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

const gaId = (process.argv[2] || "G-TGEHKPS1Z2").trim().toUpperCase();
if (!/^G-[A-Z0-9]+$/.test(gaId)) {
  console.error("Invalid GA4 id:", gaId);
  process.exit(1);
}

const e = loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const adminEnv = loadEnvFile(resolve(root, ".env"));
const sb = createClient(
  e.NEXT_PUBLIC_SUPABASE_URL || adminEnv.VITE_SUPABASE_URL,
  e.SUPABASE_SERVICE_ROLE_KEY,
);

const { data: before } = await sb
  .from("seo_analytics")
  .select("google_analytics_id, google_tag_manager_id")
  .eq("id", 1)
  .maybeSingle();

const { error } = await sb
  .from("seo_analytics")
  .update({
    google_analytics_id: gaId,
    updated_at: new Date().toISOString(),
  })
  .eq("id", 1);

if (error) {
  console.error(error);
  process.exit(1);
}

const { data: after } = await sb
  .from("seo_analytics")
  .select("google_analytics_id, google_tag_manager_id, consent_required")
  .eq("id", 1)
  .maybeSingle();

console.log({ before, after });

// Best-effort storefront revalidate (secret optional)
const origin = (
  adminEnv.VITE_STOREFRONT_ORIGIN ||
  e.NEXT_PUBLIC_SITE_URL ||
  "https://www.simplecartstore.com"
).replace(/\/$/, "");
const secret = (adminEnv.VITE_REVALIDATE_SECRET || e.REVALIDATE_SECRET || "").trim();
try {
  const res = await fetch(`${origin}/api/revalidate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-revalidate-secret": secret } : {}),
    },
    body: JSON.stringify({ all: true }),
  });
  console.log("revalidate:", res.status, await res.text().then((t) => t.slice(0, 200)));
} catch (err) {
  console.warn("revalidate failed:", err?.message || err);
}
