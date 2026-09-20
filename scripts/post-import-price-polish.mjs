/**
 * Post-import: verify Excel prices, set compare_at margins, fix zero variant stock.
 *
 * Usage:
 *   node scripts/post-import-price-polish.mjs --verify
 *   node scripts/post-import-price-polish.mjs --dry-run
 *   node scripts/post-import-price-polish.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT_PATH = join(root, "scripts/.excel-price-import-audit.json");
const VERIFY = process.argv.includes("--verify");
const DRY = process.argv.includes("--dry-run");
const APPLY = process.argv.includes("--apply");

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

function normalizeTitle(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\d+$/, "");
}

function normLabel(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Customer-facing "was" price — modest save badge (Rs 300–500). */
function compareAtForPrice(price) {
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return null;
  let margin;
  if (p < 800) margin = 300;
  else if (p < 1500) margin = 400;
  else if (p < 3000) margin = 500;
  else if (p < 5000) margin = 600;
  else margin = 800;
  const raw = p + margin;
  // Round to nearest 99 for cleaner display (e.g. 1899 → 2299)
  const rounded = Math.ceil(raw / 100) * 100 - 1;
  return rounded > p ? rounded : p + margin;
}

function inferOptionKey(labels) {
  const joined = labels.join(" ").toLowerCase();
  if (/\bmug\b/.test(joined)) return "style";
  if (/\bgolden\b|\bsilver\b|\bblack\b|\bwhite\b/.test(joined)) return "color";
  if (/\bml\b|\blit/i.test(joined)) return "size";
  if (/\b\d+\s*w\b|\bwatt/i.test(joined)) return "power";
  return "option";
}

function findProduct(byName, title) {
  const direct = byName.get(normalizeTitle(title));
  if (direct) return direct;
  const stripped = normalizeTitle(title);
  for (const [k, p] of byName.entries()) {
    if (k === stripped || k.startsWith(stripped) || stripped.startsWith(k)) return p;
  }
  return null;
}

function matchVariant(existing, optionKey, label, excludeIds = new Set()) {
  const want = normLabel(label);
  return existing.find((v) => {
    if (excludeIds.has(v.id)) return false;
    const ov = v.option_values && typeof v.option_values === "object" ? v.option_values : {};
    for (const val of Object.values(ov)) {
      if (normLabel(String(val)) === want) return true;
    }
    if (normLabel(String(ov[optionKey] ?? "")) === want) return true;
    return false;
  });
}

function expectedFromAudit(audit) {
  /** @type {Map<string, { single?: number, multi?: { label: string, price: number, key: string }[] }>} */
  const byProductId = new Map();

  for (const sample of audit.multiVariantSamples ?? []) {
    const labels = sample.variants.map((v) => v.label).filter(Boolean);
    const key = inferOptionKey(labels);
    byProductId.set(sample.title, {
      multi: sample.variants.map((v) => ({
        label: v.label,
        price: v.price,
        key,
      })),
    });
  }

  for (const a of audit.actions ?? []) {
    if (a.type === "update_price" && a.new_price != null) {
      const cur = byProductId.get(a.product) ?? {};
      if (!cur.multi) cur.single = a.new_price;
      byProductId.set(a.product, cur);
    }
  }

  return byProductId;
}

async function loadCatalog(sb) {
  const { data: products, error } = await sb
    .from("products")
    .select("id, name, status")
    .eq("status", "active");
  if (error) throw error;

  const ids = (products ?? []).map((p) => p.id);
  const { data: variants, error: vErr } = await sb
    .from("product_variants")
    .select("id, product_id, sku, price, compare_at_price, option_values")
    .in("product_id", ids);
  if (vErr) throw vErr;

  const { data: invRows, error: iErr } = await sb
    .from("inventory")
    .select("product_variant_id, quantity_on_hand")
    .in("product_variant_id", (variants ?? []).map((v) => v.id));
  if (iErr) throw iErr;

  const inv = new Map((invRows ?? []).map((r) => [r.product_variant_id, r.quantity_on_hand ?? 0]));
  const byName = new Map();
  for (const p of products ?? []) byName.set(normalizeTitle(p.name), p);

  const byProduct = new Map();
  for (const v of variants ?? []) {
    const list = byProduct.get(v.product_id) ?? [];
    list.push({ ...v, quantity_on_hand: inv.get(v.id) ?? 0 });
    byProduct.set(v.product_id, list);
  }

  return { products: products ?? [], byName, byProduct };
}

async function verifyPrices(sb, audit) {
  const catalog = await loadCatalog(sb);
  const expected = expectedFromAudit(audit);
  const failures = [];

  for (const [title, exp] of expected.entries()) {
    const product = findProduct(catalog.byName, title);
    if (!product) {
      failures.push({ title, issue: "product not found" });
      continue;
    }
    const vars = catalog.byProduct.get(product.id) ?? [];

    if (exp.multi) {
      const matched = new Set();
      for (const w of exp.multi) {
        const v = matchVariant(vars, w.key, w.label, matched);
        if (!v) {
          failures.push({ title, label: w.label, issue: "variant missing", want: w.price });
          continue;
        }
        matched.add(v.id);
        if (Number(v.price) !== w.price) {
          failures.push({
            title,
            label: w.label,
            sku: v.sku,
            issue: "wrong price",
            got: Number(v.price),
            want: w.price,
          });
        }
      }
      if (matched.size !== exp.multi.length) {
        failures.push({
          title,
          issue: "variant count mismatch",
          want: exp.multi.length,
          matched: matched.size,
          all: vars.map((x) => ({ sku: x.sku, price: x.price, ov: x.option_values })),
        });
      }
    } else if (exp.single != null) {
      for (const v of vars) {
        if (Number(v.price) !== exp.single) {
          failures.push({
            title,
            sku: v.sku,
            issue: "wrong price",
            got: Number(v.price),
            want: exp.single,
          });
        }
      }
    }
  }

  return failures;
}

async function buildPolishPlan(sb) {
  const catalog = await loadCatalog(sb);
  const compareUpdates = [];
  const stockUpdates = [];

  for (const p of catalog.products) {
    const vars = catalog.byProduct.get(p.id) ?? [];
    if (!vars.length) continue;

    const maxStock = Math.max(...vars.map((v) => v.quantity_on_hand), 0);
    const defaultStock = maxStock > 0 ? maxStock : 5;

    for (const v of vars) {
      const wantCompare = compareAtForPrice(v.price);
      const curCompare = v.compare_at_price == null ? null : Number(v.compare_at_price);
      const priceN = Number(v.price);
      let newCompare = wantCompare;
      if (curCompare != null && curCompare > priceN && curCompare >= (wantCompare ?? 0)) {
        newCompare = curCompare;
      }
      const needsCompare =
        wantCompare != null &&
        (curCompare == null || curCompare <= priceN || curCompare !== newCompare);

      if (needsCompare) {
        compareUpdates.push({
          variant_id: v.id,
          product: p.name,
          sku: v.sku,
          price: priceN,
          old_compare: curCompare,
          new_compare: newCompare,
        });
      }

      if (v.quantity_on_hand <= 0) {
        stockUpdates.push({
          variant_id: v.id,
          product: p.name,
          sku: v.sku,
          option_values: v.option_values,
          old_stock: v.quantity_on_hand,
          new_stock: defaultStock,
        });
      }
    }
  }

  return { compareUpdates, stockUpdates };
}

async function applyPolish(sb, plan) {
  let compareOk = 0;
  let stockOk = 0;
  const errors = [];

  for (const u of plan.compareUpdates) {
    const { error } = await sb
      .from("product_variants")
      .update({ compare_at_price: u.new_compare })
      .eq("id", u.variant_id);
    if (error) errors.push({ type: "compare", u, error: error.message });
    else compareOk++;
  }

  for (const u of plan.stockUpdates) {
    const { data: inv } = await sb
      .from("inventory")
      .select("product_variant_id")
      .eq("product_variant_id", u.variant_id)
      .maybeSingle();
    if (!inv) {
      const { error } = await sb.from("inventory").insert({
        product_variant_id: u.variant_id,
        quantity_on_hand: u.new_stock,
        quantity_reserved: 0,
        updated_at: new Date().toISOString(),
      });
      if (error) errors.push({ type: "stock_insert", u, error: error.message });
      else stockOk++;
    } else {
      const { error } = await sb
        .from("inventory")
        .update({
          quantity_on_hand: u.new_stock,
          updated_at: new Date().toISOString(),
        })
        .eq("product_variant_id", u.variant_id);
      if (error) errors.push({ type: "stock_update", u, error: error.message });
      else stockOk++;
    }
  }

  const { data: allProducts } = await sb.from("products").select("id").eq("status", "active");
  for (const p of allProducts ?? []) {
    const { data: pvars } = await sb
      .from("product_variants")
      .select("id")
      .eq("product_id", p.id);
    if (!pvars?.length) continue;
    const { data: invs } = await sb
      .from("inventory")
      .select("quantity_on_hand")
      .in(
        "product_variant_id",
        pvars.map((v) => v.id),
      );
    const total = (invs ?? []).reduce((s, r) => s + (r.quantity_on_hand ?? 0), 0);
    await sb.from("products").update({ stock_total: total }).eq("id", p.id);
  }

  return { compareOk, stockOk, errors };
}

async function main() {
  if (!VERIFY && !DRY && !APPLY) {
    console.error("Use --verify, --dry-run, or --apply");
    process.exit(1);
  }

  if (!existsSync(AUDIT_PATH)) {
    console.error("Audit file missing:", AUDIT_PATH);
    process.exit(1);
  }
  const audit = JSON.parse(readFileSync(AUDIT_PATH, "utf8"));

  const e = loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing Supabase env");
    process.exit(1);
  }
  const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);

  const priceFailures = await verifyPrices(sb, audit);
  console.log("Price verification:", priceFailures.length ? "FAIL" : "OK");
  if (priceFailures.length) {
    console.log(JSON.stringify(priceFailures.slice(0, 30), null, 2));
    if (priceFailures.length > 30) console.log(`… and ${priceFailures.length - 30} more`);
  }

  const plan = await buildPolishPlan(sb);
  console.log(
    JSON.stringify(
      {
        compareUpdates: plan.compareUpdates.length,
        stockUpdates: plan.stockUpdates.length,
        sampleCompare: plan.compareUpdates.slice(0, 5),
        sampleStock: plan.stockUpdates.slice(0, 8),
      },
      null,
      2,
    ),
  );

  writeFileSync(
    join(root, "scripts/.post-import-polish-plan.json"),
    JSON.stringify({ priceFailures, plan }, null, 2),
  );

  if (VERIFY) {
    process.exit(priceFailures.length ? 1 : 0);
  }

  if (DRY) return;

  const result = await applyPolish(sb, plan);
  console.log("Apply result:", JSON.stringify(result, null, 2));

  const recheck = await verifyPrices(sb, audit);
  if (recheck.length) {
    console.error("Price recheck failed:", recheck.length);
    process.exit(1);
  }

  try {
    await fetch("https://www.simplecartstore.com/api/revalidate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: "products" }),
    });
  } catch {
    /* optional */
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
