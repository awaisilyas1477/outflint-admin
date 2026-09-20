/**
 * Set store + SEO support email.
 * Usage: node scripts/_set-support-email.mjs [email]
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

const e = {
  ...loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env")),
  ...loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env.local")),
};
const email = String(process.argv[2] || "support@scs.com").trim();
if (!email.includes("@")) {
  console.error("Usage: node scripts/_set-support-email.mjs support@scs.com");
  process.exit(1);
}

const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);
const store = await sb
  .from("store_settings")
  .update({ support_email: email })
  .eq("id", 1)
  .select("support_email")
  .maybeSingle();
const seo = await sb
  .from("seo_site")
  .update({ organization_email: email })
  .eq("id", 1)
  .select("organization_email")
  .maybeSingle();

console.log({
  email,
  store: store.error ? store.error.message : store.data,
  seo: seo.error ? seo.error.message : seo.data,
});

// Also replace in policy/contact HTML if present.
const oldEmail = "support@simplecartstore.com";
const { data: pages } = await sb
  .from("policy_pages")
  .select("id, slug, body_html");
let replaced = 0;
for (const page of pages || []) {
  const html = String(page.body_html || "");
  if (!html.includes(oldEmail)) continue;
  const next = html.split(oldEmail).join(email);
  const { error } = await sb.from("policy_pages").update({ body_html: next }).eq("id", page.id);
  if (!error) {
    replaced += 1;
    console.log("updated policy_pages:", page.slug);
  } else {
    console.error("policy update failed:", page.slug, error.message);
  }
}
console.log({ policyPagesUpdated: replaced });
