/**
 * Export all active products to Excel: first image + title + empty price.
 * Images downloaded locally — one light Supabase read only (no writes).
 *
 * Usage: node scripts/export-active-products-excel.mjs
 */
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, extname, join } from "node:path";
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

function firstImageUrl(images) {
  if (!Array.isArray(images) || !images.length) return null;
  const first = images[0];
  if (typeof first === "string" && first.trim()) return first.trim();
  if (first && typeof first === "object") {
    const u = first.url || first.src || first.image_url || first.imageUrl;
    if (typeof u === "string" && u.trim()) return u.trim();
  }
  return null;
}

function safeFileBase(name, idx) {
  const base = String(name || `product-${idx}`)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return base || `product-${idx}`;
}

function extFromUrl(url, contentType) {
  const fromCt = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  if (contentType) {
    const ct = contentType.split(";")[0].trim().toLowerCase();
    if (fromCt[ct]) return fromCt[ct];
  }
  try {
    const p = new URL(url).pathname;
    const e = extname(p).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(e)) {
      return e === ".jpeg" ? ".jpg" : e;
    }
  } catch {
    /* ignore */
  }
  return ".jpg";
}

const e = loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase env from storefront .env");
  process.exit(1);
}

const outDir = resolve(
  process.env.USERPROFILE || process.env.HOME || root,
  "Desktop",
  "simplecart-active-products-export"
);
const imagesDir = join(outDir, "images");
mkdirSync(imagesDir, { recursive: true });

const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);

console.log("Fetching active products (name + images only)…");
const { data: products, error } = await sb
  .from("products")
  .select("id, name, images, slug")
  .eq("status", "active")
  .order("name", { ascending: true });

if (error) {
  console.error(error);
  process.exit(1);
}

const rows = products ?? [];
console.log(`Active products: ${rows.length}`);

const workbook = new ExcelJS.Workbook();
workbook.creator = "SimpleCart Export";
const sheet = workbook.addWorksheet("Active Products", {
  views: [{ state: "frozen", ySplit: 1, zoomScale: 100 }],
});

// Sized so 100% Excel/Windows zoom ≈ previous “perfect at 125%” look (~1.25×).
const IMG_PX = 125;
const ROW_H = 113;
sheet.columns = [
  { header: "Image", key: "image", width: 22 },
  { header: "Title", key: "title", width: 68 },
  { header: "Price", key: "price", width: 18 },
];

sheet.getRow(1).font = { bold: true, size: 12 };
sheet.getRow(1).height = 24;
sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

const summary = { ok: 0, noImage: 0, downloadFail: 0 };

for (let i = 0; i < rows.length; i++) {
  const p = rows[i];
  const title = String(p.name || "").trim() || "(untitled)";
  const url = firstImageUrl(p.images);
  const excelRow = i + 2;
  sheet.getRow(excelRow).height = ROW_H;
  sheet.getCell(`B${excelRow}`).value = title;
  sheet.getCell(`B${excelRow}`).font = { size: 12 };
  sheet.getCell(`B${excelRow}`).alignment = { vertical: "middle", wrapText: true };
  sheet.getCell(`C${excelRow}`).value = null; // empty price for manual fill
  sheet.getCell(`C${excelRow}`).alignment = { vertical: "middle", horizontal: "center" };

  if (!url) {
    summary.noImage++;
    sheet.getCell(`A${excelRow}`).value = "(no image)";
    sheet.getCell(`A${excelRow}`).alignment = { vertical: "middle", horizontal: "center" };
    continue;
  }

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "SimpleCartExport/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = extFromUrl(url, res.headers.get("content-type"));
    const fileName = `${String(i + 1).padStart(3, "0")}_${safeFileBase(title, i + 1)}${ext}`;
    const filePath = join(imagesDir, fileName);
    writeFileSync(filePath, buf);

    const imageId = workbook.addImage({
      buffer: buf,
      extension: ext === ".png" ? "png" : ext === ".gif" ? "gif" : "jpeg",
    });
    sheet.addImage(imageId, {
      tl: { col: 0.15, row: excelRow - 1 + 0.1 },
      ext: { width: IMG_PX, height: IMG_PX },
      editAs: "oneCell",
    });
    summary.ok++;
  } catch (err) {
    summary.downloadFail++;
    sheet.getCell(`A${excelRow}`).value = "(download failed)";
    sheet.getCell(`A${excelRow}`).alignment = { vertical: "middle", horizontal: "center" };
    console.warn(`Image fail [${title}]:`, err?.message || err);
  }

  if ((i + 1) % 25 === 0 || i === rows.length - 1) {
    console.log(`Processed ${i + 1}/${rows.length}`);
  }
}

const xlsxPath = join(outDir, "active-products-title-image-price.xlsx");
await workbook.xlsx.writeFile(xlsxPath);

console.log(
  JSON.stringify(
    {
      outDir,
      xlsx: xlsxPath,
      products: rows.length,
      imagesOk: summary.ok,
      noImage: summary.noImage,
      downloadFail: summary.downloadFail,
    },
    null,
    2
  )
);
