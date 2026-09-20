import { useCallback, useEffect, useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { AdminStandardDialogContent } from "@/components/ui/admin-standard-dialog";
import { Label } from "@/components/ui/label";
import {
  downloadProductCatalogCsv,
  downloadReviewsImportTemplate,
  parseCsvRows,
  parseReviewCsvDataRows,
  REVIEWS_CSV_MAX_ROWS,
  type CsvRowParseResult,
  type ParsedCsvReviewRow,
  type ProductCatalogCsvRow,
} from "@/lib/reviews-csv-import";
import { revalidateStorefrontAfterReviewsChange } from "@/lib/revalidate-after-reviews";
import { supabase } from "@/lib/supabase/client";
import {
  createReviewAsAdmin,
  fetchProductPicklistAdmin,
  fetchProductSlugIdMapAdmin,
  type ProductPicklistRow,
} from "@/lib/supabase/reviews-admin";
import { cn } from "@/lib/utils";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
};

export function ReviewCsvImportDialog({ open, onOpenChange, onImported }: Props) {
  const [products, setProducts] = useState<ProductPicklistRow[]>([]);
  const [slugMap, setSlugMap] = useState<Map<string, string>>(new Map());
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const [defaultProductId, setDefaultProductId] = useState("");
  const [applyProductToAllRows, setApplyProductToAllRows] = useState(false);

  const [fileName, setFileName] = useState<string | null>(null);
  const [csvGrid, setCsvGrid] = useState<string[][] | null>(null);
  const [parseResults, setParseResults] = useState<CsvRowParseResult[] | null>(null);
  const [importing, setImporting] = useState(false);

  const catalogRows: ProductCatalogCsvRow[] = useMemo(
    () =>
      products.map((p) => ({
        id: p.id,
        name: p.name,
        slug: (p.slug ?? "").trim(),
        status: p.status,
      })),
    [products],
  );

  const exampleSlug = useMemo(() => {
    const picked = products.find((p) => p.id === defaultProductId);
    if (picked?.slug?.trim()) return picked.slug.trim();
    const first = products.find((p) => (p.slug ?? "").trim());
    return first?.slug?.trim() ?? null;
  }, [products, defaultProductId]);

  const reset = useCallback(() => {
    setDefaultProductId("");
    setApplyProductToAllRows(false);
    setFileName(null);
    setCsvGrid(null);
    setParseResults(null);
    setImporting(false);
  }, []);

  const loadCatalog = useCallback(async () => {
    if (!supabase) return;
    setLoadingCatalog(true);
    try {
      const [picklist, slugs] = await Promise.all([
        fetchProductPicklistAdmin(1000),
        fetchProductSlugIdMapAdmin(5000),
      ]);
      setProducts(picklist);
      setSlugMap(slugs);
    } catch {
      toast.error("Could not load products for import.");
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadCatalog();
    else queueMicrotask(reset);
  }, [open, loadCatalog, reset]);

  const runParse = useCallback(
    (grid: string[][]) => {
      if (grid.length < 2) {
        setParseResults(null);
        return;
      }
      const [header, ...dataRows] = grid;
      const forceId = applyProductToAllRows && defaultProductId ? defaultProductId : null;
      const results = parseReviewCsvDataRows(header, dataRows, {
        slugToId: slugMap,
        defaultProductId: defaultProductId || null,
        forceProductId: forceId,
      });
      setParseResults(results);
      const ok = results.filter((r) => r.ok).length;
      const bad = results.filter((r) => !r.ok).length;
      if (ok === 0 && bad > 0) {
        toast.error("No valid rows. Fix errors or assign a product, then try again.");
      } else if (bad > 0) {
        toast.message(`Parsed ${String(ok)} valid row(s), ${String(bad)} issue(s).`);
      } else {
        toast.success(`Parsed ${String(ok)} row(s) ready to import.`);
      }
    },
    [slugMap, defaultProductId, applyProductToAllRows],
  );

  useEffect(() => {
    if (!csvGrid) return;
    runParse(csvGrid);
  }, [csvGrid, runParse]);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!supabase) {
      toast.error("Supabase is not configured.");
      return;
    }
    setFileName(file.name);
    setParseResults(null);
    try {
      const text = await file.text();
      const grid = parseCsvRows(text);
      if (grid.length < 2) {
        toast.error("CSV needs a header row and at least one data row.");
        setFileName(null);
        setCsvGrid(null);
        return;
      }
      setCsvGrid(grid);
    } catch {
      toast.error("Could not read that file.");
      setFileName(null);
      setCsvGrid(null);
    }
  }

  async function runImport() {
    if (!parseResults || !supabase) return;
    const rows = parseResults.filter((r): r is { ok: true; row: ParsedCsvReviewRow } => r.ok);
    if (rows.length === 0) {
      toast.error("Nothing to import.");
      return;
    }
    setImporting(true);
    let created = 0;
    let failed = 0;
    for (const { row } of rows) {
      const res =
        row.user_id != null
          ? await createReviewAsAdmin({
              product_id: row.product_id,
              user_id: row.user_id,
              rating: row.rating,
              title: row.title,
              body: row.body,
              status: row.status,
              media: row.media.length > 0 ? row.media : null,
            })
          : await createReviewAsAdmin({
              product_id: row.product_id,
              attributed_display_name: row.attributed_display_name ?? "",
              attributed_display_email: row.attributed_display_email,
              rating: row.rating,
              title: row.title,
              body: row.body,
              status: row.status,
              media: row.media.length > 0 ? row.media : null,
            });
      if (res.ok) created++;
      else failed++;
    }
    setImporting(false);
    if (created > 0) {
      revalidateStorefrontAfterReviewsChange();
    }
    if (failed > 0) {
      toast.warning(`Imported ${String(created)} review(s). ${String(failed)} failed (e.g. duplicate product per user).`, {
        description: "Check the reviews list and CSV for duplicates.",
      });
    } else {
      toast.success(`Imported ${String(created)} review(s).`);
    }
    reset();
    onOpenChange(false);
    onImported();
  }

  const okCount = parseResults?.filter((r) => r.ok).length ?? 0;
  const errors = parseResults?.filter((r) => !r.ok) ?? [];
  const hasUnknownSlug = errors.some(
    (e) => !e.ok && (e.error.includes("Unknown product_slug") || e.error.includes("product_slug")),
  );

  const selectedProduct = products.find((p) => p.id === defaultProductId);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <AdminStandardDialogContent
        title="Import reviews from CSV"
        subtitle={`Up to ${String(REVIEWS_CSV_MAX_ROWS)} rows per file. Assign a product below or put product_slug / product_id on each CSV row.`}
        footer={
          <DialogFooter className="flex-wrap gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={loadingCatalog}
              onClick={() => downloadReviewsImportTemplate(exampleSlug)}
            >
              Template
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={loadingCatalog || catalogRows.length === 0}
              onClick={() => downloadProductCatalogCsv(catalogRows)}
            >
              Product list
            </Button>
            <Button type="button" disabled={importing || okCount === 0} onClick={() => void runImport()}>
              {importing ? "Importing…" : `Import ${String(okCount)} review(s)`}
            </Button>
          </DialogFooter>
        }
      >
        <div className="space-y-4">
          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-sm font-medium text-foreground">Product assignment</p>
            <div className="space-y-2">
              <Label htmlFor="csv-default-product">Product (same as &quot;Add review&quot;)</Label>
              <select
                id="csv-default-product"
                value={defaultProductId}
                onChange={(e) => setDefaultProductId(e.target.value)}
                className={cn(selectClass, loadingCatalog && "opacity-60")}
                disabled={loadingCatalog}
              >
                <option value="">None — each CSV row must specify product_slug or product_id</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {(p.slug ?? "").trim() ? ` — ${p.slug}` : ""}
                    {p.status !== "active" ? ` (${p.status})` : ""}
                  </option>
                ))}
              </select>
              {selectedProduct ? (
                <p className="text-xs text-muted-foreground">
                  Slug for CSV: <code className="rounded bg-muted px-1">{selectedProduct.slug || "(no slug)"}</code>
                  {" · "}
                  ID: <code className="rounded bg-muted px-1 text-[10px]">{selectedProduct.id}</code>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Download <strong>Product list</strong> for every product_id and product_slug in your catalog.
                </p>
              )}
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={applyProductToAllRows}
                disabled={!defaultProductId}
                onChange={(e) => setApplyProductToAllRows(e.target.checked)}
              />
              <span>
                <span className="font-medium text-foreground">Apply this product to every row</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Ignores product_slug / product_id in the file. Use when the CSV has no product column.
                </span>
              </span>
            </label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reviews-csv-file">CSV file</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" asChild>
                <label htmlFor="reviews-csv-file" className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" />
                  Choose file
                </label>
              </Button>
              <input
                id="reviews-csv-file"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => void onPickFile(e)}
              />
              {fileName ? <span className="text-sm text-muted-foreground">{fileName}</span> : null}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Columns (header names, case-insensitive)</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>
                <strong>product_slug</strong> or <strong>product_id</strong> — optional if you pick a default product
                above
              </li>
              <li>
                <strong>user_id</strong> — if set, review is for that customer (must not duplicate product per user)
              </li>
              <li>
                If <strong>user_id</strong> is empty: <strong>reviewer_name</strong>, <strong>name</strong>, or{" "}
                <strong>display_name</strong>
              </li>
              <li>Optional: reviewer_email / email</li>
              <li>
                <strong>rating</strong> (1–5), <strong>title</strong>, <strong>review</strong> or <strong>body</strong>
              </li>
              <li>
                Optional: <strong>status</strong> (pending | approved | rejected; default approved)
              </li>
              <li>
                Optional: <strong>media_urls</strong> — public https URLs, separated by | or ;
              </li>
            </ul>
          </div>

          {parseResults && parseResults.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {okCount} ready to import
                {errors.length > 0 ? ` · ${String(errors.length)} issue(s)` : ""}
              </p>
              {hasUnknownSlug && catalogRows.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Slug not found? Use{" "}
                  <button
                    type="button"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => downloadProductCatalogCsv(catalogRows)}
                  >
                    Product list
                  </button>{" "}
                  and copy an exact <strong>product_slug</strong> from that file.
                </p>
              ) : null}
              {errors.length > 0 ? (
                <div className="max-h-48 overflow-y-auto rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
                  {errors.map((e, i) => (
                    <p key={i} className="py-0.5">
                      Line {e.lineNumber}: {"error" in e ? e.error : ""}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </AdminStandardDialogContent>
    </Dialog>
  );
}
