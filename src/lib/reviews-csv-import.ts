import type { ReviewMediaDbItem, ReviewModerationStatus } from "@/lib/supabase/reviews-admin";

/** RFC4180-style CSV rows (handles quoted fields with commas). */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") {
      cell += c;
    }
  }
  row.push(cell);
  if (row.length > 1 || row.some((x) => x.trim() !== "")) {
    rows.push(row);
  }
  return rows;
}

function normHeader(h: string): string {
  return h.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, "_");
}

function getCell(map: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = map[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|$)/i;

export function parseMediaUrlsField(raw: string): ReviewMediaDbItem[] {
  if (!raw.trim()) return [];
  const parts = raw
    .split(/[|;]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const out: ReviewMediaDbItem[] = [];
  for (const url of parts) {
    if (!/^https?:\/\//i.test(url)) continue;
    const kind: "image" | "video" = VIDEO_EXT.test(url) ? "video" : "image";
    out.push({ url, kind });
    if (out.length >= 6) break;
  }
  return out;
}

function parseStatus(raw: string): ReviewModerationStatus | null {
  const t = raw.trim().toLowerCase();
  if (t === "pending" || t === "approved" || t === "rejected") return t;
  return null;
}

export type ParsedCsvReviewRow = {
  lineNumber: number;
  product_id: string;
  user_id: string | null;
  attributed_display_name: string | null;
  attributed_display_email: string | null;
  rating: number;
  title: string;
  body: string;
  status: ReviewModerationStatus;
  media: ReviewMediaDbItem[];
};

export type CsvRowParseResult =
  | { ok: true; row: ParsedCsvReviewRow }
  | { ok: false; lineNumber: number; error: string };

export const REVIEWS_CSV_MAX_ROWS = 250;

export const REVIEWS_CSV_HEADER =
  "product_slug,user_id,reviewer_name,reviewer_email,rating,title,review,status,media_urls";

/** Escape a cell for RFC4180 CSV output. */
export function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export type ProductCatalogCsvRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

/** Review import template with a real catalog slug when available (no fake placeholder slugs). */
export function buildReviewsImportTemplate(exampleSlug?: string | null): string {
  const slug = (exampleSlug ?? "").trim() || "YOUR_PRODUCT_SLUG";
  const row = [
    slug,
    "",
    "Reviewer Name",
    "",
    "5",
    "Review title",
    "Review text goes here.",
    "approved",
    "",
  ]
    .map(escapeCsvCell)
    .join(",");
  return `${REVIEWS_CSV_HEADER}\n${row}`;
}

/** Downloadable list of products for filling product_slug / product_id in review CSVs. */
export function buildProductCatalogCsv(products: ProductCatalogCsvRow[]): string {
  const lines = [
    "product_id,product_slug,product_name,status",
    ...products.map((p) =>
      [p.id, p.slug, p.name, p.status].map((c) => escapeCsvCell(c)).join(","),
    ),
  ];
  return lines.join("\n");
}

export type ParseReviewCsvOptions = {
  /** Lowercased slug → product id */
  slugToId: Map<string, string>;
  /** Used when a row omits product_id and product_slug */
  defaultProductId?: string | null;
  /** When set, every row uses this product (CSV product columns are ignored) */
  forceProductId?: string | null;
};

function downloadCsvFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadReviewsImportTemplate(exampleSlug?: string | null): void {
  downloadCsvFile("reviews-import-template.csv", buildReviewsImportTemplate(exampleSlug));
}

export function downloadProductCatalogCsv(products: ProductCatalogCsvRow[]): void {
  downloadCsvFile("products-for-review-import.csv", buildProductCatalogCsv(products));
}

/**
 * Parse data rows (after header). `slugToId` keys must be lowercased slugs.
 */
export function parseReviewCsvDataRows(
  headerRow: string[],
  dataRows: string[][],
  options: ParseReviewCsvOptions,
): CsvRowParseResult[] {
  const { slugToId, defaultProductId, forceProductId } = options;
  const forcedId = forceProductId?.trim() || "";
  const fallbackId = defaultProductId?.trim() || "";
  const headers = headerRow.map(normHeader);
  const idx = (name: string) => headers.indexOf(name);

  const iProductId = idx("product_id");
  const iSlug = idx("product_slug");
  const iUserId = idx("user_id");
  const iRating = idx("rating");
  const iTitle = idx("title");
  const iBody = idx("body");
  const iReview = idx("review");
  const iStatus = idx("status");
  const iMedia = idx("media_urls");
  const iMediaAlt = idx("media");

  if (iRating < 0 || iTitle < 0) {
    return [{ ok: false, lineNumber: 1, error: "CSV must include columns: rating, title (and body or review)." }];
  }
  if (iBody < 0 && iReview < 0) {
    return [{ ok: false, lineNumber: 1, error: "CSV must include a review column: body or review." }];
  }
  if (iProductId < 0 && iSlug < 0 && !forcedId && !fallbackId) {
    return [
      {
        ok: false,
        lineNumber: 1,
        error:
          "CSV must include product_id or product_slug, or choose a default product in the import dialog.",
      },
    ];
  }

  const results: CsvRowParseResult[] = [];
  let lineNumber = 2;
  let nonEmptyRowCount = 0;

  for (const cells of dataRows) {
    if (cells.every((c) => (c ?? "").trim() === "")) {
      lineNumber++;
      continue;
    }
    if (nonEmptyRowCount >= REVIEWS_CSV_MAX_ROWS) {
      results.push({
        ok: false,
        lineNumber,
        error: `Stopped at ${String(REVIEWS_CSV_MAX_ROWS)} data rows (max per import). Split into multiple files if needed.`,
      });
      break;
    }
    nonEmptyRowCount += 1;

    const map: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j];
      if (key) map[key] = cells[j] ?? "";
    }

    let product_id = forcedId;
    const productIdRaw = iProductId >= 0 ? (cells[iProductId] ?? "").trim() : "";
    const slugRaw = iSlug >= 0 ? (cells[iSlug] ?? "").trim().toLowerCase() : "";

    if (!product_id) {
      product_id = productIdRaw;
      if (!product_id && slugRaw) {
        product_id = slugToId.get(slugRaw) ?? "";
      }
      if (!product_id && fallbackId) {
        product_id = fallbackId;
      }
    }

    if (!product_id) {
      const hint =
        slugRaw && !slugToId.has(slugRaw)
          ? ` Unknown product_slug: "${slugRaw}". Download "Product list" and use a slug from that file.`
          : " Missing product_id / product_slug — pick a default product above or add a column to the CSV.";
      results.push({
        ok: false,
        lineNumber,
        error: hint.trim(),
      });
      lineNumber++;
      continue;
    }

    const userIdRaw = iUserId >= 0 ? (cells[iUserId] ?? "").trim() : "";
    const user_id = userIdRaw || null;

    const nameFrom = getCell(map, "reviewer_name", "name", "display_name");
    const emailFrom = getCell(map, "reviewer_email", "email");

    const ratingStr = (cells[iRating] ?? "").trim();
    const rating = Number.parseInt(ratingStr, 10);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      results.push({ ok: false, lineNumber, error: `Invalid rating: "${ratingStr}" (need 1–5).` });
      lineNumber++;
      continue;
    }

    const title = (cells[iTitle] ?? "").trim();
    const body =
      iBody >= 0
        ? (cells[iBody] ?? "").trim()
        : iReview >= 0
          ? (cells[iReview] ?? "").trim()
          : "";
    if (!title) {
      results.push({ ok: false, lineNumber, error: "Title is empty." });
      lineNumber++;
      continue;
    }
    if (!body) {
      results.push({ ok: false, lineNumber, error: "Review / body is empty." });
      lineNumber++;
      continue;
    }

    let status: ReviewModerationStatus = "approved";
    if (iStatus >= 0) {
      const st = parseStatus(cells[iStatus] ?? "");
      if (!st) {
        results.push({
          ok: false,
          lineNumber,
          error: `Invalid status: "${(cells[iStatus] ?? "").trim()}" (use pending, approved, or rejected).`,
        });
        lineNumber++;
        continue;
      }
      status = st;
    }

    if (user_id) {
      const attributed_display_name = null;
      const attributed_display_email = null;
      const mediaRaw =
        iMedia >= 0 ? (cells[iMedia] ?? "").trim() : iMediaAlt >= 0 ? (cells[iMediaAlt] ?? "").trim() : "";
      const media = parseMediaUrlsField(mediaRaw);
      results.push({
        ok: true,
        row: {
          lineNumber,
          product_id,
          user_id,
          attributed_display_name,
          attributed_display_email,
          rating,
          title,
          body,
          status,
          media,
        },
      });
    } else {
      const displayName = nameFrom.trim();
      if (!displayName) {
        results.push({
          ok: false,
          lineNumber,
          error: "Provide user_id for a registered customer, or reviewer_name / name for a display-only review.",
        });
        lineNumber++;
        continue;
      }
      const mediaRaw =
        iMedia >= 0 ? (cells[iMedia] ?? "").trim() : iMediaAlt >= 0 ? (cells[iMediaAlt] ?? "").trim() : "";
      const media = parseMediaUrlsField(mediaRaw);
      results.push({
        ok: true,
        row: {
          lineNumber,
          product_id,
          user_id: null,
          attributed_display_name: displayName,
          attributed_display_email: emailFrom.trim() || null,
          rating,
          title,
          body,
          status,
          media,
        },
      });
    }

    lineNumber++;
  }

  return results;
}
