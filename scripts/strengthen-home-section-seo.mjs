/**
 * Strengthen SEO for home_page_sections (/s/[slug]).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://www.simplecartstore.com";
const DEFAULT_OG =
  "https://onmnnxcdwcuegsbvjoqa.supabase.co/storage/v1/object/public/e-commerce-store/seo/og/e72edb9a-79da-4e48-8b66-a72901846ab8.jpg";
const BRAND = "SimpleCart Store";

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

const { data: sections, error } = await sb
  .from("home_page_sections")
  .select("id,name,slug,is_active,sort_order")
  .order("sort_order", { ascending: true });
if (error) throw error;
console.log("sections", sections?.length, sections?.map((s) => s.slug));

let n = 0;
for (const s of sections || []) {
  const title = clamp(`${s.name} Pakistan`, 58);
  const description = clamp(
    `Shop ${s.name} at SimpleCart Store — curated home, kitchen and beauty essentials with cash on delivery across Pakistan.`,
    158,
  );
  const keywords = [
    `${s.name} Pakistan`,
    `buy ${s.name} online`,
    "home essentials Pakistan",
    "cash on delivery",
    BRAND,
  ];
  const { data: existing } = await sb
    .from("seo_meta")
    .select("id")
    .eq("subject_type", "home_section")
    .eq("subject_id", s.id)
    .eq("locale", "en")
    .maybeSingle();
  const payload = {
    subject_type: "home_section",
    subject_id: s.id,
    subject_key: null,
    locale: "en",
    title,
    description,
    keywords,
    canonical_url: `${ORIGIN}/s/${encodeURIComponent(s.slug)}`,
    og_image_url: DEFAULT_OG,
    og_image_alt: `${s.name} | ${BRAND}`,
    og_image_width: 1200,
    og_image_height: 630,
    twitter_card: "summary_large_image",
    noindex: !s.is_active,
    nofollow: false,
  };
  if (existing?.id) {
    const { error: uErr } = await sb.from("seo_meta").update(payload).eq("id", existing.id);
    if (uErr) throw new Error(uErr.message);
  } else {
    const { error: iErr } = await sb.from("seo_meta").insert(payload);
    if (iErr) throw new Error(iErr.message);
  }
  n++;
  console.log("home_section", s.slug, "→", title, s.is_active ? "" : "(noindex)");
}
console.log("updated", n);
