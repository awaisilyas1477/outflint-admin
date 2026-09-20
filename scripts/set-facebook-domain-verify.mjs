import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const CODE = "tjpddcojcedph4a00w91crkcrdmfy5";

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

const storefrontEnv = {
  ...loadEnvFile(
    resolve(root, "../../w-cartstore-web/e-commerce-website/.env"),
  ),
  ...loadEnvFile(
    resolve(root, "../../w-cartstore-web/e-commerce-website/.env.local"),
  ),
};
const adminEnv = loadEnvFile(resolve(root, ".env"));
/** Prefer storefront secrets for revalidate; admin env fills gaps. */
const e = { ...adminEnv, ...storefrontEnv };

const url = e.NEXT_PUBLIC_SUPABASE_URL || e.VITE_SUPABASE_URL;
const key = e.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key);

const { data: before, error: rErr } = await sb
  .from("seo_search_engine_verifications")
  .select("facebook_domain_verification")
  .eq("id", 1)
  .maybeSingle();
if (rErr) throw rErr;
console.log("Before:", before?.facebook_domain_verification || "(empty)");

const { error: uErr } = await sb
  .from("seo_search_engine_verifications")
  .update({
    facebook_domain_verification: CODE,
    updated_at: new Date().toISOString(),
  })
  .eq("id", 1);
if (uErr) throw uErr;

const { data: after, error: aErr } = await sb
  .from("seo_search_engine_verifications")
  .select("facebook_domain_verification")
  .eq("id", 1)
  .maybeSingle();
if (aErr) throw aErr;
console.log("After:", after?.facebook_domain_verification || "(empty)");
console.log("OK:", after?.facebook_domain_verification === CODE);

const secret = e.REVALIDATE_SECRET || e.VITE_REVALIDATE_SECRET;
const origins = [
  ...(e.VITE_STOREFRONT_ORIGIN
    ? [e.VITE_STOREFRONT_ORIGIN.replace(/\/$/, "")]
    : []),
  "https://www.simplecartstore.com",
  "https://simplecartstore.com",
].filter((v, i, a) => a.indexOf(v) === i);

if (secret) {
  for (const origin of origins) {
    try {
      const res = await fetch(`${origin}/api/revalidate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-revalidate-secret": secret,
        },
        body: JSON.stringify({
          all: true,
          tag: "layout:site-identity",
          paths: ["/"],
        }),
      });
      console.log("Revalidate", origin, "→", res.status, await res.text());
    } catch (err) {
      console.warn("Revalidate failed", origin, err);
    }
  }
} else {
  console.log("No REVALIDATE_SECRET — skipping API revalidate (cache TTL ~5m)");
}

await new Promise((r) => setTimeout(r, 2500));

for (const host of [
  "https://www.simplecartstore.com/",
  "https://simplecartstore.com/",
]) {
  const html = await (await fetch(host, { cache: "no-store" })).text();
  const meta =
    (html.match(
      /name=["']facebook-domain-verification["']\s+content=["']([^"']+)["']/i,
    ) ||
      html.match(
        /content=["']([^"']+)["']\s+name=["']facebook-domain-verification["']/i,
      ) ||
      [])[1] || "";
  console.log(host, "→", meta ? meta : "(missing)");
}
