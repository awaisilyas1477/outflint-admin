/**
 * Apply reviews_stats_locked for glass cup + set Daraz aggregate 4.7 / 378.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(
  resolve(root, "../../w-cartstore-web/e-commerce-website/package.json"),
);
const pg = require("pg");

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

const webEnv = load(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const password = webEnv.SUPABASE_DB_PASSWORD;
const ref = webEnv.SUPABASE_PROJECT_REF || "onmnnxcdwcuegsbvjoqa";
if (!password) throw new Error("Missing SUPABASE_DB_PASSWORD");

const sql = readFileSync(
  resolve(root, "../../w-cartstore-web/e-commerce-website/supabase/migrations/20260821120000_reviews_stats_locked.sql"),
  "utf8",
);

const client = new pg.Client({
  host: `db.${ref}.supabase.co`,
  port: 5432,
  database: "postgres",
  user: "postgres",
  password,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
await client.query(sql);

const productId = "c6ebea21-043a-4af0-bcfb-b39138dfe6a7";
await client.query(
  `update public.products
   set reviews_stats_locked = true,
       rating = 4.7,
       reviews_count = 378,
       updated_at = now()
   where id = $1`,
  [productId],
);
const { rows } = await client.query(
  `select rating, reviews_count, reviews_stats_locked from public.products where id = $1`,
  [productId],
);
console.log(rows[0]);
await client.end();

await fetch("https://www.simplecartstore.com/api/revalidate-review-surface", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ productSlug: "round-glass-cup-with-wooden-lid" }),
});
console.log("revalidated");
