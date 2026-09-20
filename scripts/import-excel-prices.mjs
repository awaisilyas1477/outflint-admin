/**
 * Import customer prices from filled Excel export.
 * - Updates `product_variants.price` only (ignores WSP column).
 * - Preserves existing `compare_at_price`.
 * - Creates variants when Price cell lists multiple options.
 *
 * Usage:
 *   node scripts/import-excel-prices.mjs --dry-run
 *   node scripts/import-excel-prices.mjs --apply
 *   node scripts/import-excel-prices.mjs --verify
 */
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import {
  readFileSync,
  existsSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");
const APPLY = process.argv.includes("--apply");
const VERIFY = process.argv.includes("--verify");

const XLSX_PATH = resolve(
  root,
  "public/simplecart-active-products-export (1)/simplecart-active-products-export/simplecart-active-products-export/active-products-title-image-price.xlsx",
);
const EXPORT_FOLDER = resolve(root, "public/simplecart-active-products-export (1)");
const AUDIT_PATH = join(root, "scripts/.excel-price-import-audit.json");

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

function cellText(v) {
  if (v == null) return "";
  if (typeof v === "object" && v !== null) {
    if ("result" in v) return cellText(v.result);
    if ("text" in v) return String(v.text).trim();
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((r) => r.text ?? "").join("").trim();
    }
  }
  return String(v).trim();
}

function normalizeTitle(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\d+$/, "");
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

function parseSegmentVariant(seg) {
  const s = seg.trim();
  if (!s) return null;

  const eq = s.match(/^(.+?)\s*=\s*([\d,]{3,}(?:\.\d+)?)\s*(.*)$/i);
  if (eq) {
    const suffix = eq[3]?.trim();
    const label = suffix ? `${eq[1].trim()} ${suffix}`.trim() : eq[1].trim();
    return { label, price: Number(eq[2].replace(/,/g, "")) };
  }

  const withSuffix = s.match(/^(.+?)\s+([\d,]{3,}(?:\.\d+)?)\s+(with\s+.+)$/i);
  if (withSuffix) {
    return {
      label: `${withSuffix[1].trim()} ${withSuffix[3].trim()}`,
      price: Number(withSuffix[2].replace(/,/g, "")),
    };
  }

  const endPrice = s.match(/^(.+?)\s+([\d,]{3,}(?:\.\d+)?)$/);
  if (endPrice) {
    return {
      label: endPrice[1].trim(),
      price: Number(endPrice[2].replace(/,/g, "")),
    };
  }

  const startPrice = s.match(/^([\d,]{4,}(?:\.\d+)?)\s+(.+)$/);
  if (startPrice) {
    return {
      label: startPrice[2].trim(),
      price: Number(startPrice[1].replace(/,/g, "")),
    };
  }

  throw new Error(`Cannot parse price segment: "${s}"`);
}

/** @returns {{ label: string, price: number }[] | null} null = skip row (DELETE) */
function parsePriceCell(raw) {
  const s = cellText(raw);
  if (!s) return [];

  if (/^delete$/i.test(s.trim())) {
    return null;
  }

  const plain = s.replace(/,/g, "");
  if (/^\d+(?:\.\d+)?$/.test(plain)) {
    return [{ label: "", price: Number(plain) }];
  }

  // "799 with jewlery" — leading price + note
  const leadPrice = s.match(/^([\d,]+(?:\.\d+)?)\s+(.+)$/);
  if (leadPrice && !/[=|]/.test(s)) {
    const rest = leadPrice[2].trim().toLowerCase();
    if (rest.startsWith("with ") || rest.startsWith("without ")) {
      return [{ label: "", price: Number(leadPrice[1].replace(/,/g, "")) }];
    }
  }

  if (/\|/.test(s)) {
    const parts = s.split(/\s*\|\s*/);
    const out = [];
    for (const part of parts) {
      const parsed = parseSegmentVariant(part);
      if (parsed) out.push(parsed);
    }
    if (!out.length) throw new Error(`Cannot parse price: "${s}"`);
    return out;
  }

  // Multiple "label = price" without pipes: "simple mug = 899 line mug = 999"
  const eqPairs = [...s.matchAll(/([^=|]+?)\s*=\s*([\d,]+(?:\.\d+)?)/g)];
  if (eqPairs.length > 1) {
    return eqPairs.map((m) => ({
      label: m[1].trim(),
      price: Number(m[2].replace(/,/g, "")),
    }));
  }

  // "full golden 5499 black golden6499" — repeated label + price chunks
  const chunks = [...s.matchAll(/([a-z][a-z\s]*?)\s*(\d{3,5})/gi)];
  if (chunks.length > 1) {
    return chunks.map((m) => ({
      label: m[1].trim(),
      price: Number(m[2]),
    }));
  }

  const single = parseSegmentVariant(s);
  return [single];
}

function inferOptionKey(labels) {
  const joined = labels.join(" ").toLowerCase();
  if (/\bmug\b/.test(joined)) return "style";
  if (/\bgolden\b|\bsilver\b|\bblack\b|\bwhite\b|\bcolor\b/.test(joined)) return "color";
  if (/\bml\b|\blit/i.test(joined)) return "size";
  if (/\b\d+\s*w\b|\bwatt/i.test(joined)) return "power";
  return "option";
}

function titleCaseLabel(label) {
  const t = label.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function normLabel(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*=\s*/g, " ");
}

async function readExcelRows() {
  if (!existsSync(XLSX_PATH)) {
    throw new Error(`Excel not found: ${XLSX_PATH}`);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);
  const sh = wb.worksheets[0];
  /** @type {{ row: number, title: string, priceRaw: string, wspRaw: string, variants: { label: string, price: number }[], skip?: boolean }[]} */
  const rows = [];
  for (let r = 2; r <= sh.rowCount; r++) {
    const title = cellText(sh.getCell(`B${r}`).value);
    if (!title) continue;
    const priceRaw = cellText(sh.getCell(`C${r}`).value);
    const wspRaw = cellText(sh.getCell(`D${r}`).value);
    if (!priceRaw) {
      rows.push({ row: r, title, priceRaw, wspRaw, variants: [] });
      continue;
    }
    const parsed = parsePriceCell(priceRaw);
    if (parsed === null) {
      rows.push({ row: r, title, priceRaw, wspRaw, variants: [], skip: true });
      continue;
    }
    rows.push({ row: r, title, priceRaw, wspRaw, variants: parsed });
  }
  return rows;
}

function generateSku(prefix, slugHint, index, used) {
  const slugPart = slugHint.replace(/[^a-zA-Z0-9]/g, "") || "prd";
  let midNum = 0;
  for (let i = 0; i < slugPart.length; i++) {
    midNum = (midNum + slugPart.charCodeAt(i) * (i + 7)) % 1000;
  }
  const mid = String((midNum + index * 17) % 1000).padStart(3, "0");
  for (let t = 0; t < 200; t++) {
    const tail = String(1000 + ((Date.now() + index * 97 + t * 13) % 9000));
    const sku = `${prefix}-${mid}-${tail}`;
    if (!used.has(sku)) {
      used.add(sku);
      return sku;
    }
  }
  throw new Error("SKU generation failed");
}

async function loadCatalog(sb) {
  const { data: products, error } = await sb
    .from("products")
    .select("id, name, slug, status")
    .eq("status", "active")
    .order("name");
  if (error) throw error;

  const ids = (products ?? []).map((p) => p.id);
  const { data: variants, error: vErr } = await sb
    .from("product_variants")
    .select("id, product_id, sku, price, compare_at_price, option_values, size_id, color_id")
    .in("product_id", ids);
  if (vErr) throw vErr;

  const { data: invRows, error: iErr } = await sb
    .from("inventory")
    .select("product_variant_id, quantity_on_hand")
    .in(
      "product_variant_id",
      (variants ?? []).map((v) => v.id),
    );
  if (iErr) throw iErr;

  const invByVariant = new Map(
    (invRows ?? []).map((r) => [r.product_variant_id, r.quantity_on_hand ?? 0]),
  );

  const byName = new Map();
  for (const p of products ?? []) {
    byName.set(normalizeTitle(p.name), p);
  }

  const variantsByProduct = new Map();
  for (const v of variants ?? []) {
    const list = variantsByProduct.get(v.product_id) ?? [];
    list.push({ ...v, quantity_on_hand: invByVariant.get(v.id) ?? 0 });
    variantsByProduct.set(v.product_id, list);
  }

  return { products: products ?? [], byName, variantsByProduct };
}

function matchVariantByLabel(existing, optionKey, label, excludeIds = new Set()) {
  const want = normLabel(label);
  return existing.find((v) => {
    if (excludeIds.has(v.id)) return false;
    const ov = v.option_values && typeof v.option_values === "object" ? v.option_values : {};
    const direct = normLabel(ov[optionKey] ?? "");
    if (direct && direct === want) return true;
    for (const val of Object.values(ov)) {
      if (normLabel(String(val)) === want) return true;
    }
    return false;
  });
}

function buildPlan(excelRows, catalog) {
  const usedSkus = new Set();
  for (const list of catalog.variantsByProduct.values()) {
    for (const v of list) usedSkus.add(v.sku);
  }

  /** @type {Record<string, unknown>[]} */
  const actions = [];
  const unmatched = [];
  const skippedEmpty = [];
  const skippedDelete = [];

  for (const row of excelRows) {
    if (row.skip) {
      skippedDelete.push({ row: row.row, title: row.title, priceRaw: row.priceRaw });
      continue;
    }
    if (!row.variants.length) {
      skippedEmpty.push({ row: row.row, title: row.title });
      continue;
    }

    const product = findProduct(catalog.byName, row.title);
    if (!product) {
      unmatched.push({ row: row.row, title: row.title, priceRaw: row.priceRaw });
      continue;
    }

    const existing = catalog.variantsByProduct.get(product.id) ?? [];
    const isMulti = row.variants.length > 1;

    if (!isMulti) {
      const price = row.variants[0].price;
      for (const v of existing) {
        actions.push({
          type: "update_price",
          product: product.name,
          product_id: product.id,
          variant_id: v.id,
          sku: v.sku,
          old_price: v.price,
          new_price: price,
          label: null,
        });
      }
      if (!existing.length) {
        actions.push({
          type: "missing_variant",
          product: product.name,
          product_id: product.id,
          note: "No variants in DB",
        });
      }
      continue;
    }

    const labels = row.variants.map((x) => x.label).filter(Boolean);
    const optionKey = inferOptionKey(labels);
    const optionDef = {
      product_id: product.id,
      option_key: optionKey,
      label: optionKey === "style" ? "Style" : optionKey === "power" ? "Power" : optionKey === "size" ? "Size" : "Option",
      presentation: "pills",
      sort_order: 0,
    };

    actions.push({
      type: "set_option_definition",
      product: product.name,
      product_id: product.id,
      optionDef,
    });

    const matchedIds = new Set();
    let baseVariant = existing[0] ?? null;

    for (let i = 0; i < row.variants.length; i++) {
      const { label, price } = row.variants[i];
      const displayLabel = titleCaseLabel(label);
      const option_values = { [optionKey]: displayLabel };

      let target = matchVariantByLabel(existing, optionKey, label, matchedIds);
      if (!target && existing.length === 1 && i === 0 && matchedIds.size === 0) {
        target = existing[0];
      }

      if (target) {
        matchedIds.add(target.id);
        actions.push({
          type: "update_variant",
          product: product.name,
          product_id: product.id,
          variant_id: target.id,
          sku: target.sku,
          old_price: target.price,
          new_price: price,
          option_values,
          label: displayLabel,
        });
      } else {
        const sku = generateSku("SIM", product.slug, i + 1, usedSkus);
        const stock = i === 0 && baseVariant ? baseVariant.quantity_on_hand : 0;
        actions.push({
          type: "create_variant",
          product: product.name,
          product_id: product.id,
          sku,
          new_price: price,
          option_values,
          label: displayLabel,
          quantity_on_hand: stock,
          compare_at_price: baseVariant?.compare_at_price ?? null,
        });
      }
    }

    for (const v of existing) {
      if (!matchedIds.has(v.id) && row.variants.length > 1) {
        actions.push({
          type: "orphan_variant",
          product: product.name,
          product_id: product.id,
          variant_id: v.id,
          sku: v.sku,
          option_values: v.option_values,
          note: "Not matched to Excel variants — left unchanged",
        });
      }
    }
  }

  return { actions, unmatched, skippedEmpty, skippedDelete };
}

async function applyActions(sb, actions) {
  const summary = { updated: 0, created: 0, optionDefs: 0, errors: [] };

  for (const a of actions) {
    try {
      if (a.type === "set_option_definition") {
        await sb.from("product_option_definitions").delete().eq("product_id", a.product_id);
        const { error } = await sb.from("product_option_definitions").insert(a.optionDef);
        if (error) throw error;
        summary.optionDefs++;
      } else if (a.type === "update_price" || a.type === "update_variant") {
        const patch = { price: a.new_price };
        if (a.type === "update_variant") patch.option_values = a.option_values;
        const { error } = await sb
          .from("product_variants")
          .update(patch)
          .eq("id", a.variant_id);
        if (error) throw error;
        summary.updated++;
      } else if (a.type === "create_variant") {
        const { data: ins, error } = await sb
          .from("product_variants")
          .insert({
            product_id: a.product_id,
            sku: a.sku,
            option_values: a.option_values,
            price: a.new_price,
            compare_at_price: a.compare_at_price,
            size_id: null,
            color_id: null,
          })
          .select("id")
          .single();
        if (error || !ins) throw error ?? new Error("insert failed");
        const { error: invErr } = await sb.from("inventory").insert({
          product_variant_id: ins.id,
          quantity_on_hand: a.quantity_on_hand ?? 0,
          quantity_reserved: 0,
          updated_at: new Date().toISOString(),
        });
        if (invErr) throw invErr;
        summary.created++;
      }
    } catch (err) {
      summary.errors.push({
        action: a,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}

async function verifyAgainstExcel(sb) {
  const excelRows = await readExcelRows();
  const catalog = await loadCatalog(sb);
  const failures = [];

  for (const row of excelRows) {
    if (!row.variants.length) continue;
    const product = findProduct(catalog.byName, row.title);
    if (!product) {
      failures.push({ title: row.title, issue: "product not found" });
      continue;
    }
    const existing = catalog.variantsByProduct.get(product.id) ?? [];

    if (row.variants.length === 1) {
      const want = row.variants[0].price;
      for (const v of existing) {
        if (Number(v.price) !== want) {
          failures.push({
            title: row.title,
            sku: v.sku,
            issue: `price ${v.price} != ${want}`,
          });
        }
      }
      continue;
    }

    const labels = row.variants.map((x) => x.label).filter(Boolean);
    const optionKey = inferOptionKey(labels);
    for (const { label, price } of row.variants) {
      const v = matchVariantByLabel(existing, optionKey, label);
      if (!v) {
        failures.push({ title: row.title, label, issue: "variant missing" });
        continue;
      }
      if (Number(v.price) !== price) {
        failures.push({
          title: row.title,
          label,
          sku: v.sku,
          issue: `price ${v.price} != ${price}`,
        });
      }
    }
  }

  return failures;
}

async function main() {
  if (!DRY && !APPLY && !VERIFY) {
    console.error("Use --dry-run, --apply, or --verify");
    process.exit(1);
  }

  const e = loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing Supabase env");
    process.exit(1);
  }
  const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);

  if (VERIFY) {
    const failures = await verifyAgainstExcel(sb);
    if (failures.length) {
      console.log(JSON.stringify({ ok: false, failures }, null, 2));
      process.exit(1);
    }
    console.log(JSON.stringify({ ok: true, message: "All Excel prices match DB" }, null, 2));
    return;
  }

  const excelRows = await readExcelRows();
  const catalog = await loadCatalog(sb);
  const { actions, unmatched, skippedEmpty, skippedDelete } = buildPlan(excelRows, catalog);

  const audit = {
    at: new Date().toISOString(),
    mode: DRY ? "dry-run" : "apply",
    excelPath: XLSX_PATH,
    totals: {
      excelRows: excelRows.length,
      withPrice: excelRows.filter((r) => r.variants.length).length,
      emptyPrice: skippedEmpty.length,
      skippedDelete: skippedDelete.length,
      unmatched: unmatched.length,
      actions: actions.length,
      updates: actions.filter((a) => a.type === "update_price" || a.type === "update_variant").length,
      creates: actions.filter((a) => a.type === "create_variant").length,
      multiVariantProducts: excelRows.filter((r) => r.variants.length > 1).length,
    },
    multiVariantSamples: excelRows
      .filter((r) => r.variants.length > 1)
      .map((r) => ({ title: r.title, priceRaw: r.priceRaw, variants: r.variants })),
    unmatched,
    skippedEmpty,
    skippedDelete,
    actions,
  };

  writeFileSync(AUDIT_PATH, JSON.stringify(audit, null, 2));
  console.log(JSON.stringify(audit.totals, null, 2));
  console.log(`Audit: ${AUDIT_PATH}`);

  if (unmatched.length) {
    console.warn("Unmatched titles:", unmatched);
  }

  if (DRY) return;

  const summary = await applyActions(sb, actions);
  console.log("Apply summary:", JSON.stringify(summary, null, 2));

  const failures = await verifyAgainstExcel(sb);
  if (failures.length) {
    console.error("Verification failed:", JSON.stringify(failures, null, 2));
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

  if (existsSync(EXPORT_FOLDER)) {
    rmSync(EXPORT_FOLDER, { recursive: true, force: true });
    console.log("Deleted export folder:", EXPORT_FOLDER);
  }

  console.log("Done — prices verified and export folder removed.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
