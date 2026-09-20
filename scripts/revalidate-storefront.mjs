/**
 * Full storefront revalidate via active-admin JWT (production has no REVALIDATE_SECRET).
 * Usage: node scripts/revalidate-storefront.mjs
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
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[t.slice(0, eq).trim()] = val.replace(/\s+#.*$/, "");
  }
  return out;
}

const storefrontRoot = resolve(root, "../../w-cartstore-web/e-commerce-website");
const prod = loadEnvFile(resolve(storefrontRoot, ".env.production.local"));
const local = loadEnvFile(resolve(storefrontRoot, ".env"));
const env = { ...prod, ...local };

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const origin = (env.NEXT_PUBLIC_SITE_URL || "https://www.simplecartstore.com").replace(/\/$/, "");

if (!url || !serviceKey || !anon) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const adminSb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: admins, error: adminErr } = await adminSb
  .from("admins")
  .select("auth_id, email, status")
  .eq("status", "active")
  .limit(5);
if (adminErr) throw adminErr;
if (!admins?.length) {
  console.error("No active admin found");
  process.exit(1);
}

let jwt = null;
for (const row of admins) {
  const email = row.email;
  if (!email) continue;
  const { data: linkData, error: linkErr } = await adminSb.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !linkData?.properties?.hashed_token) continue;

  const authSb = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessionData, error: otpErr } = await authSb.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });
  if (otpErr || !sessionData.session?.access_token) continue;
  jwt = sessionData.session.access_token;
  console.log("Using admin session for", email);
  break;
}

if (!jwt) {
  console.error("Could not obtain admin JWT for revalidate");
  process.exit(1);
}

const body = {
  all: true,
  tag: "products",
  tags: ["catalog", "products", "layout"],
  paths: [
    "/",
    "/products/n7-neck-shoulder-kneading-massager",
    "/products/n7-neck-and-shoulder-massager",
    "/products/wavy-bow-glass-tumbler-with-bamboo-lid-glass-straw-with-bow-d-cor-reusable-glass",
  ],
};

const res = await fetch(`${origin}/api/revalidate`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${jwt}`,
  },
  body: JSON.stringify(body),
});

const text = await res.text();
console.log(res.status, text);

if (!res.ok) process.exit(1);
