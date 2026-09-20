import { Fragment, useEffect, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowDown, ArrowUp, Copy, Layers, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { AdminTextarea } from "@/components/dashboard/admin-textarea";
import { StarRatingInput } from "@/components/dashboard/star-rating-input";
import { toast } from "sonner";
import { ProductDescriptionEditor } from "@/components/dashboard/product-description-editor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADMIN_MSG_CATALOG_UNAVAILABLE } from "@/lib/admin-user-messages";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ADMIN_LIST_CARD_CLASS,
  ADMIN_LIST_CARD_HEADER_CLASS,
  ADMIN_LIST_CARD_CONTENT_CLASS,
} from "@/components/dashboard/admin-list-shell";
import {
  QuickAddColorDialog,
  QuickAddSizeDialog,
} from "@/components/dashboard/product-quick-add-size-color-dialogs";
import { cn } from "@/lib/utils";
import {
  fetchCollections,
  fetchColors,
  fetchProductWithVariants,
  fetchSizes,
  fetchStoreNameForSku,
  fetchTags,
  saveProductAndVariants,
  deleteProduct,
  duplicateProductAdmin,
  type ProductSavePayload,
  type VariantSavePayload,
} from "@/lib/supabase/catalog";
import { generateUniqueSkuForProduct, prefixFromStoreName } from "@/lib/sku-generator";
import type {
  CollectionRow,
  ColorRow,
  ProductAssetRow,
  SizeRow,
  TagRow,
} from "@/lib/supabase/catalog-types";
import { slugFromLabel } from "@/lib/slug";
import { uploadProductMedia } from "@/lib/supabase/storage";
import { TagMultiSelect } from "@/components/dashboard/tag-multi-select";
import { collectionIsTagBased } from "@/lib/catalog/collection-type";
import { supabase } from "@/lib/supabase/client";
import { SeoFieldsSection } from "@/components/dashboard/seo-fields-section";
import { ProductShoppingAttributesSection } from "@/components/dashboard/product-shopping-attributes-section";
import { revalidateStorefront } from "@/lib/seo/revalidate";
import {
  collectOptionKeysFromVariants,
  mergeVariantKeysIntoSchema,
  type VariantOptionSchemaEntry,
} from "@/lib/variant-option-schema";

const STOREFRONT_DIMENSION_KEYS = ["size", "color"] as const;
type StorefrontDimensionKey = (typeof STOREFRONT_DIMENSION_KEYS)[number];

function isStorefrontDimensionKey(k: string): k is StorefrontDimensionKey {
  return k === "size" || k === "color";
}

function allowedKeysForRow(
  rows: VariantOptionSchemaEntry[],
  rowIndex: number,
): StorefrontDimensionKey[] {
  const raw = rows[rowIndex]?.key.trim() ?? "";
  const current = isStorefrontDimensionKey(raw) ? raw : null;
  const usedElsewhere = new Set(
    rows
      .map((r, j) => (j !== rowIndex ? r.key.trim() : ""))
      .filter(isStorefrontDimensionKey),
  );
  return [...STOREFRONT_DIMENSION_KEYS].filter(
    (k) => (current !== null && k === current) || !usedElsewhere.has(k),
  );
}

function keysFromVariantForms(vs: VariantForm[]): string[] {
  const s = new Set<string>();
  for (const row of vs) {
    if (row.sizeId) s.add("size");
    if (row.colorId) s.add("color");
  }
  return [...s].sort((a, b) => a.localeCompare(b));
}

type VariantForm = {
  /** `product_variants.id` when this row was loaded from the database. */
  id?: string;
  sku: string;
  sizeId: string;
  colorId: string;
  price: string;
  compareAt: string;
  /** Units on hand for this SKU (matrix products only; simple product uses parent total). */
  stock: string;
};

type AssetForm = {
  key: string;
  url: string;
  kind: "image" | "video";
  alt_text: string;
};

function newAssetRow(): AssetForm {
  return {
    key: crypto.randomUUID(),
    url: "",
    kind: "image",
    alt_text: "",
  };
}

const emptyVariant = (): VariantForm => ({
  sku: "",
  sizeId: "",
  colorId: "",
  price: "0",
  compareAt: "",
  stock: "0",
});

function inferSizeId(sizes: SizeRow[], optionValues: Record<string, string>): string {
  if (!sizes.length) return "";
  const lab = optionValues.size;
  if (!lab) return "";
  return sizes.find((s) => s.display_name === lab)?.id ?? "";
}

function sizeChoices(sizes: SizeRow[], currentSizeId: string): SizeRow[] {
  return sizes.filter((s) => s.is_active || s.id === currentSizeId);
}

function inferColorId(colors: ColorRow[], optionValues: Record<string, string>): string {
  if (!colors.length) return "";
  const lab = optionValues.color;
  if (!lab) return "";
  return colors.find((c) => c.name === lab)?.id ?? "";
}

function colorChoices(colors: ColorRow[], currentColorId: string): ColorRow[] {
  return colors.filter((c) => c.is_active || c.id === currentColorId);
}

function buildAssetsFromLoad(
  imagesUnknown: unknown,
  dbAssets: ProductAssetRow[],
): AssetForm[] {
  if (dbAssets.length > 0) {
    return dbAssets.map((a) => ({
      key: a.id,
      url: a.url,
      kind: a.kind,
      alt_text: a.alt_text ?? "",
    }));
  }
  if (Array.isArray(imagesUnknown)) {
    const urls = imagesUnknown.filter((u): u is string => typeof u === "string" && u.trim() !== "");
    if (urls.length > 0) {
      return urls.map((url, i) => ({
        key: `legacy-${i}`,
        url,
        kind: "image" as const,
        alt_text: "",
      }));
    }
  }
  return [newAssetRow()];
}

const PRODUCT_EDIT_STEPS = 6;

function ProductFormSection({
  step,
  title,
  description,
  children,
  className,
  headerRight,
  id,
  cardHeaderClassName,
}: {
  step: number;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  headerRight?: ReactNode;
  id?: string;
  cardHeaderClassName?: string;
}) {
  return (
    <Card
      id={id ?? `product-form-step-${step}`}
      className={cn(ADMIN_LIST_CARD_CLASS, "scroll-mt-4", className)}
    >
      <CardHeader
        className={cn(
          ADMIN_LIST_CARD_HEADER_CLASS,
          "space-y-3 bg-muted/25 dark:bg-muted/10",
          cardHeaderClassName,
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="inline-flex h-7 shrink-0 items-center rounded-full bg-primary/10 px-2.5 text-xs font-semibold tabular-nums text-primary"
                aria-label={`Section ${step} of ${PRODUCT_EDIT_STEPS}`}
              >
                {step}/{PRODUCT_EDIT_STEPS}
              </span>
              <CardTitle className="text-lg">{title}</CardTitle>
            </div>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {headerRight ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{headerRight}</div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className={cn(ADMIN_LIST_CARD_CONTENT_CLASS, "space-y-6")}>{children}</CardContent>
    </Card>
  );
}

export function ProductEditPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const isNew = productId === "new" || !productId;

  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [sizes, setSizes] = useState<SizeRow[]>([]);
  const [colors, setColors] = useState<ColorRow[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [uploadingAssetKey, setUploadingAssetKey] = useState<string | null>(null);
  const [generatingSkuIndex, setGeneratingSkuIndex] = useState<number | null>(null);
  const [storeDisplayName, setStoreDisplayName] = useState("Store");
  const [quickSizeOpen, setQuickSizeOpen] = useState(false);
  const [quickColorOpen, setQuickColorOpen] = useState(false);

  const [name, setName] = useState("");
  /** Slug currently stored in DB (stable URL). */
  const [loadedSlug, setLoadedSlug] = useState<string>("");
  /** Slug that will be written on next save (defaults to loadedSlug). */
  const [slugDraft, setSlugDraft] = useState<string>("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"draft" | "active">("draft");
  /** Product-level opt-in: line excluded from standard delivery / cart free-delivery thresholds. */
  const [freeDelivery, setFreeDelivery] = useState(false);
  /** Sticky storefront reel — YouTube / Facebook / Instagram / direct MP4 URL. */
  const [videoUrl, setVideoUrl] = useState("");
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [assets, setAssets] = useState<AssetForm[]>([newAssetRow()]);
  const [catalogTags, setCatalogTags] = useState<TagRow[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(() => new Set());
  const [searchKeywordsExtra, setSearchKeywordsExtra] = useState("");
  const [rating, setRating] = useState(0);
  const [reviewsCount, setReviewsCount] = useState("");
  /** Total units for simple (single-SKU) products; matrix totals are the sum of per-variant stock. */
  const [parentStock, setParentStock] = useState("0");
  /** When the product has a single variant row (no size/color), we keep its UUID for in-place saves. */
  const [simpleVariantId, setSimpleVariantId] = useState<string | null>(null);
  /** Matrix rows (optional size and/or color per SKU). Empty = "simple" product with one SKU below. */
  const [variants, setVariants] = useState<VariantForm[]>([]);
  /** When there are no matrix rows, this single line is saved as one variant (no size/color). */
  const [simpleSku, setSimpleSku] = useState("");
  const [simplePrice, setSimplePrice] = useState("0");
  const [simpleCompareAt, setSimpleCompareAt] = useState("");
  const [generatingSimpleSku, setGeneratingSimpleSku] = useState(false);
  /** Storefront PDP: label + presentation per option_values key. */
  const [variantOptionSchema, setVariantOptionSchema] = useState<
    VariantOptionSchemaEntry[]
  >([]);

  useEffect(() => {
    if (!supabase) return;
    void fetchCollections().then(setCollections);
    void fetchSizes().then(setSizes);
    void fetchColors().then(setColors);
    void fetchTags().then(setCatalogTags);
    void fetchStoreNameForSku().then(setStoreDisplayName);
  }, []);

  function mergeSizeIntoState(row: SizeRow) {
    setSizes((prev) =>
      [...prev, row].sort(
        (a, b) =>
          a.sort_order - b.sort_order || a.display_name.localeCompare(b.display_name),
      ),
    );
    toast.success(`Size “${row.display_name}” saved — it’s in the size dropdown now.`);
  }

  function mergeColorIntoState(row: ColorRow) {
    setColors((prev) =>
      [...prev, row].sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
      ),
    );
    toast.success(`Color “${row.name}” saved — it’s in the color dropdown now.`);
  }

  useEffect(() => {
    if (isNew || !productId || !supabase) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await fetchProductWithVariants(productId);
      if (cancelled) return;
      if (!res) {
        toast.error("Product not found.");
        setLoading(false);
        return;
      }
      const [sizeList, colorList] = await Promise.all([fetchSizes(), fetchColors()]);
      if (cancelled) return;
      setSizes(sizeList);
      setColors(colorList);

      const { product, variants: vv, collectionIds, tagIds, assets: dbAssets } = res;
      setName(product.name);
      setLoadedSlug(product.slug ?? "");
      setSlugDraft(product.slug ?? "");
      setShortDescription(product.short_description);
      setDescription(product.description);
      setSearchKeywordsExtra(product.search_keywords_extra ?? "");
      setStatus(product.status);
      setFreeDelivery(Boolean(product.free_delivery));
      setVideoUrl((product.video_url ?? "").trim());
      setSelectedCollectionIds(new Set(collectionIds));
      setAssets(buildAssetsFromLoad(product.images, dbAssets));
      setSelectedTagIds(new Set(tagIds));
      setRating(product.rating != null ? Number(product.rating) : 0);
      setReviewsCount(product.reviews_count != null ? String(product.reviews_count) : "");
      const sumVariantStock = vv.reduce((s, v) => s + (v.quantity_on_hand ?? 0), 0);
      const oneBare =
        vv.length === 1 && !vv[0].size_id && !vv[0].color_id;
      if (oneBare) {
        const v0 = vv[0];
        setSimpleVariantId(v0.id);
        setSimpleSku(v0.sku);
        setSimplePrice(String(v0.price));
        setSimpleCompareAt(
          v0.compare_at_price != null ? String(v0.compare_at_price) : "",
        );
        setParentStock(
          String(
            product.stock_total != null && product.stock_total >= 0
              ? product.stock_total
              : v0.quantity_on_hand,
          ),
        );
        setVariants([]);
        setVariantOptionSchema([]);
      } else if (vv.length > 0) {
        setSimpleVariantId(null);
        setSimpleSku("");
        setSimplePrice("0");
        setSimpleCompareAt("");
        setParentStock(
          String(
            product.stock_total != null && product.stock_total >= 0
              ? product.stock_total
              : sumVariantStock,
          ),
        );
        setVariants(
          vv.map((v) => ({
            id: v.id,
            sku: v.sku,
            sizeId: v.size_id ?? inferSizeId(sizeList, v.option_values ?? {}),
            colorId:
              v.color_id ?? inferColorId(colorList, v.option_values ?? {}),
            price: String(v.price),
            compareAt: v.compare_at_price != null ? String(v.compare_at_price) : "",
            stock: String(v.quantity_on_hand ?? 0),
          })),
        );
        const keysFromDb = collectOptionKeysFromVariants(
          vv.map((v) => v.option_values ?? {}),
        ).filter(isStorefrontDimensionKey);
        const parsedSchema = (product.option_definitions ?? []).filter((r) =>
          isStorefrontDimensionKey(r.key.trim()),
        );
        setVariantOptionSchema(
          mergeVariantKeysIntoSchema(parsedSchema, keysFromDb),
        );
      } else {
        setSimpleVariantId(null);
        setSimpleSku("");
        setSimplePrice("0");
        setSimpleCompareAt("");
        setParentStock(
          String(
            product.stock_total != null && product.stock_total >= 0
              ? product.stock_total
              : 0,
          ),
        );
        setVariants([]);
        setVariantOptionSchema([]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, productId]);

  function onMergeKeysFromVariantForm() {
    const keys = keysFromVariantForms(variants).filter(isStorefrontDimensionKey);
    setVariantOptionSchema((prev) => mergeVariantKeysIntoSchema(prev, keys));
  }

  function addDimensionRow() {
    setVariantOptionSchema((prev) => {
      const used = new Set(
        prev.map((r) => r.key.trim()).filter(isStorefrontDimensionKey),
      );
      const nextKey = STOREFRONT_DIMENSION_KEYS.find((k) => !used.has(k));
      if (!nextKey) return prev;
      return [
        ...prev,
        {
          key: nextKey,
          label: nextKey === "size" ? "Size" : "Color",
          presentation: nextKey === "color" ? "swatches" : "pills",
          sort_order: prev.length,
        },
      ];
    });
  }

  function removeDimensionRow(index: number) {
    setVariantOptionSchema((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((r, i) => ({ ...r, sort_order: i })),
    );
  }

  async function onRefreshVariantKeysFromDb() {
    if (!productId || isNew || !supabase) return;
    const res = await fetchProductWithVariants(productId);
    if (!res) {
      toast.error("Could not load the latest product details.");
      return;
    }
    const keysFromDb = collectOptionKeysFromVariants(
      res.variants.map((v) => v.option_values ?? {}),
    ).filter(isStorefrontDimensionKey);
    setVariantOptionSchema((prev) =>
      mergeVariantKeysIntoSchema(prev, keysFromDb),
    );
    toast.success("Variant fields updated from the saved product. Save when you are ready to keep layout changes.");
  }

  async function onAssetFile(key: string, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingAssetKey(key);
    const res = await uploadProductMedia(file);
    setUploadingAssetKey(null);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    setAssets((prev) =>
      prev.map((row) =>
        row.key === key ? { ...row, url: res.publicUrl, kind: res.kind } : row,
      ),
    );
    toast.success("File uploaded — save the product to persist.");
  }

  async function onGenerateSimpleSku() {
    const others = [
      ...variants.map((v) => v.sku.trim()).filter(Boolean),
      ...(simpleSku.trim() ? [simpleSku.trim()] : []),
    ];
    setGeneratingSimpleSku(true);
    const res = await generateUniqueSkuForProduct(
      storeDisplayName,
      slugFromLabel(name) || "product",
      others,
      { productId: isNew ? null : productId ?? null },
    );
    setGeneratingSimpleSku(false);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    setSimpleSku(res.sku);
  }

  async function onGenerateSku(variantIndex: number) {
    const others = variants
      .filter((_, j) => j !== variantIndex)
      .map((v) => v.sku.trim())
      .filter(Boolean);
    setGeneratingSkuIndex(variantIndex);
    const res = await generateUniqueSkuForProduct(
      storeDisplayName,
      slugFromLabel(name) || "product",
      others,
      { productId: isNew ? null : productId ?? null },
    );
    setGeneratingSkuIndex(null);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    setVariants((prev) => {
      const next = [...prev];
      const row = next[variantIndex];
      if (row) next[variantIndex] = { ...row, sku: res.sku };
      return next;
    });
  }

  function moveAsset(index: number, dir: -1 | 1) {
    setAssets((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j]!, next[index]!];
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) {
      toast.error(ADMIN_MSG_CATALOG_UNAVAILABLE);
      return;
    }

    // Keep existing storefront URL stable on edit. Regenerating from `name` on every
    // save (including price-only edits) broke SEO and caused "URL changed after price update".
    const slugFromName = slugFromLabel(name);
    const slug = isNew
      ? slugFromName
      : (slugDraft.trim() || loadedSlug.trim() || slugFromName);
    if (!slug) {
      toast.error(
        "Use a name with letters or numbers so we can build a URL (e.g. “Graphic Tee”).",
      );
      return;
    }

    const assetPayload = assets
      .filter((a) => a.url.trim() !== "")
      .map((a, i) => ({
        url: a.url.trim(),
        kind: a.kind,
        alt_text: a.alt_text.trim(),
        sort_order: i,
      }));

    const parentTotal = Number.parseInt(parentStock, 10);
    if (variants.length === 0) {
      if (Number.isNaN(parentTotal) || parentTotal < 0) {
        toast.error("Total inventory must be a whole number zero or greater.");
        return;
      }
    }

    const vpayload: VariantSavePayload[] = [];

    if (variants.length === 0) {
      const price = Number.parseFloat(simplePrice);
      if (!simpleSku.trim() || Number.isNaN(price)) {
        toast.error(
          "Add a SKU and price for this product, or use “Add variant” for size/color rows.",
        );
        return;
      }
      vpayload.push({
        id: simpleVariantId?.trim() ? simpleVariantId.trim() : undefined,
        sku: simpleSku.trim(),
        option_values: {},
        size_id: null,
        color_id: null,
        price,
        compare_at_price:
          simpleCompareAt.trim() === ""
            ? null
            : Number.parseFloat(simpleCompareAt),
        quantity_on_hand: parentTotal,
      });
    } else {
      const seenCombo = new Map<string, number>();
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i]!;
        const comboSig = `${v.sizeId || ""}\t${v.colorId || ""}`;
        if (seenCombo.has(comboSig)) {
          toast.error(
            `Duplicate variant: rows ${seenCombo.get(comboSig)! + 1} and ${i + 1} use the same size and color. Use one row per combination or change size/color.`,
          );
          return;
        }
        seenCombo.set(comboSig, i);
      }
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i]!;
        const price = Number.parseFloat(v.price);
        const rowStock = Number.parseInt(v.stock, 10);
        if (!v.sku.trim() || Number.isNaN(price)) {
          toast.error("Each variant needs SKU and valid price.");
          return;
        }
        if (!v.sizeId && !v.colorId) {
          toast.error(
            "Each variant needs at least a size or a color (so buyers can tell SKUs apart).",
          );
          return;
        }
        if (Number.isNaN(rowStock) || rowStock < 0) {
          toast.error("Each variant needs a valid stock quantity (0 or greater).");
          return;
        }
        const option_values: Record<string, string> = {};
        let sizeId: string | null = null;
        if (v.sizeId) {
          const sizeLabel = sizes.find((s) => s.id === v.sizeId)?.display_name;
          if (!sizeLabel) {
            toast.error("Invalid size on a variant — choose a valid size again.");
            return;
          }
          option_values.size = sizeLabel;
          sizeId = v.sizeId;
        }
        let colorId: string | null = null;
        if (v.colorId) {
          const colorRow = colors.find((c) => c.id === v.colorId);
          if (!colorRow) {
            toast.error("Invalid color on a variant — choose a valid color again.");
            return;
          }
          option_values.color = colorRow.name;
          colorId = v.colorId;
        }

        vpayload.push({
          id: v.id?.trim() ? v.id.trim() : undefined,
          sku: v.sku.trim(),
          option_values,
          size_id: sizeId,
          color_id: colorId,
          price,
          compare_at_price:
            v.compareAt.trim() === "" ? null : Number.parseFloat(v.compareAt),
          quantity_on_hand: rowStock,
        });
      }
    }

    const matrixStockTotal = variants.reduce((sum, v) => {
      const n = Number.parseInt(v.stock, 10);
      return sum + (Number.isNaN(n) ? 0 : Math.max(0, n));
    }, 0);

    const schemaRows = variantOptionSchema
      .map((r) => ({
        key: r.key.trim(),
        label: r.label.trim(),
        presentation: r.presentation,
        sort_order: r.sort_order,
      }))
      .filter((r) => isStorefrontDimensionKey(r.key));

    const seenKeys = new Set<string>();
    for (const r of schemaRows) {
      if (seenKeys.has(r.key)) {
        toast.error(
          `Duplicate dimension key "${r.key}" in Storefront variant display — use each key once.`,
        );
        return;
      }
      seenKeys.add(r.key);
    }

    const schemaForSave = schemaRows.map((row, index) => ({
      ...row,
      sort_order: index,
    }));

    const payload: ProductSavePayload = {
      collection_ids: Array.from(selectedCollectionIds),
      tag_ids: Array.from(selectedTagIds),
      slug,
      name: name.trim(),
      short_description: shortDescription.trim(),
      description: description.trim(),
      search_keywords_extra: searchKeywordsExtra.trim(),
      status,
      free_delivery: freeDelivery,
      video_url: videoUrl.trim() || null,
      assets: assetPayload,
      rating: rating > 0 ? rating : null,
      reviews_count: reviewsCount.trim() === "" ? null : Number.parseInt(reviewsCount, 10),
      stock_total: variants.length > 0 ? matrixStockTotal : parentTotal,
      option_definitions: schemaForSave,
    };

    const skuTrimmed = vpayload.map((v) => v.sku.trim()).filter(Boolean);
    const skuSeen = new Set<string>();
    for (const s of skuTrimmed) {
      const key = s.toLowerCase();
      if (skuSeen.has(key)) {
        toast.error(
          `Duplicate SKU in this product: "${s}". Each variant must have a different SKU for this listing.`,
        );
        return;
      }
      skuSeen.add(key);
    }

    setSaving(true);
    const result = await saveProductAndVariants(
      isNew ? null : productId ?? null,
      payload,
      vpayload,
    );
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Saved.");
    if (isNew) {
      navigate(`/dashboard/products/${result.id}`, { replace: true });
    } else {
      const previousSlug = loadedSlug.trim();
      if (previousSlug && previousSlug !== slug && supabase) {
        const fromPath = `/products/${previousSlug}`;
        const toPath = `/products/${slug}`;
        const { error: redirectErr } = await supabase.from("url_redirects").upsert(
          {
            from_path: fromPath,
            to_path: toPath,
            status_code: 301,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "from_path" },
        );
        if (redirectErr) {
          toast.warning(`Saved, but redirect failed: ${redirectErr.message}`);
        }
      }
      setLoadedSlug(slug);
      setSlugDraft(slug);
      const slugForRevalidate = slug || previousSlug;
      if (slugForRevalidate) void revalidateStorefront({ productSlug: slugForRevalidate });
      if (previousSlug && previousSlug !== slug) {
        void revalidateStorefront({ productSlug: previousSlug });
      }
    }
  }

  async function onDelete() {
    if (isNew || !productId || !supabase) return;
    if (!window.confirm("Delete this product and all variants?")) return;
    const err = await deleteProduct(productId);
    if (err) {
      toast.error(err);
      return;
    }
    navigate("/dashboard/products");
  }

  async function onDuplicate() {
    if (isNew || !productId || !supabase) return;
    setDuplicating(true);
    try {
      const { id, error } = await duplicateProductAdmin(productId);
      if (error || !id) {
        toast.error(error ?? "Could not duplicate product.");
        return;
      }
      toast.success("Product duplicated as draft.");
      navigate(`/dashboard/products/${id}`);
    } finally {
      setDuplicating(false);
    }
  }

  if (!supabase) {
    return (
      <Card className="max-w-lg border-dashed border-amber-500/40 bg-amber-500/6">
        <CardHeader>
          <CardTitle className="text-base">Connection required</CardTitle>
          <CardDescription>{ADMIN_MSG_CATALOG_UNAVAILABLE}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="w-full min-w-0 space-y-8">
        <div className="space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full max-w-lg" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-56" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const matrixStockSumDisplay = variants.reduce((sum, v) => {
    const n = Number.parseInt(v.stock, 10);
    return sum + (Number.isNaN(n) ? 0 : Math.max(0, n));
  }, 0);

  const hasStorefrontSizeRow = variantOptionSchema.some(
    (r) => r.key.trim() === "size",
  );
  const hasStorefrontColorRow = variantOptionSchema.some(
    (r) => r.key.trim() === "color",
  );
  const canAddStorefrontDimension = !(
    hasStorefrontSizeRow && hasStorefrontColorRow
  );

  function moveSchemaRow(index: number, dir: -1 | 1) {
    setVariantOptionSchema((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j]!, next[index]!];
      return next.map((row, i) => ({ ...row, sort_order: i }));
    });
  }

  return (
    <Fragment>
    <div className="w-full min-w-0 space-y-8">
      <PageHeader
        backLink={{ to: "/dashboard/products", label: "Products" }}
        title={isNew ? "New product" : "Edit product"}
        description={
          isNew
            ? "Parent listing plus sellable SKUs. Set stock per variant row, or one total for a single-SKU product."
            : "Update the parent listing, media, and variant SKUs."
        }
        actions={
          !isNew && productId ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={duplicating || saving}
              onClick={() => void onDuplicate()}
            >
              <Copy className="mr-2 h-4 w-4" />
              {duplicating ? "Duplicating…" : "Duplicate"}
            </Button>
          ) : null
        }
      />

      {isNew ? (
        <div
          role="note"
          className="w-full rounded-xl border border-primary/20 bg-primary/6 px-5 py-4 text-sm leading-relaxed text-muted-foreground shadow-sm dark:bg-primary/10"
        >
          <span className="font-semibold text-foreground">Parent + sellable SKUs.</span> The parent is
          the listing (name, gallery, description). With no variant rows, you enter one SKU and
          price/stock for the product itself. Use &quot;Add variant&quot; when you need size/color
          combinations — each row is a child SKU. One save stores everything.
        </div>
      ) : null}


      <form onSubmit={(e) => void onSubmit(e)} className="w-full max-w-none space-y-8">
        <nav
          aria-label="On this page"
          className="flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-xl border border-border/60 bg-muted/15 px-4 py-3 text-sm dark:bg-muted/10"
        >
          <span className="font-medium text-foreground">On this page</span>
          <a href="#product-form-step-1" className="text-primary underline-offset-4 hover:underline">
            Basics
          </a>
          <a href="#product-form-step-2" className="text-primary underline-offset-4 hover:underline">
            Description
          </a>
          <a href="#product-form-step-3" className="text-primary underline-offset-4 hover:underline">
            Media
          </a>
          <a href="#product-form-step-4" className="text-primary underline-offset-4 hover:underline">
            PDP options
          </a>
          <a href="#product-form-step-5" className="text-primary underline-offset-4 hover:underline">
            Pricing &amp; SKUs
          </a>
          <a href="#product-form-step-6" className="text-primary underline-offset-4 hover:underline">
            Tags &amp; proof
          </a>
        </nav>

        <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-x-8">
          <div className="min-w-0 space-y-8" aria-label="Listing content">
        <ProductFormSection
          step={1}
          title="Basics & visibility"
          description="Name, status, short line, and where this listing appears in your catalog."
        >
          <div className="space-y-6">
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Listing</p>
                  <p className="text-xs text-muted-foreground">
                    Shown on cards and search.{" "}
                    {isNew
                      ? "New products get a URL from the name."
                      : "Editing the name or price does not change the product URL."}
                  </p>
                  <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="name">Product name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="off"
                  />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
                    <span>
                      Storefront URL:{" "}
                      <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.8rem]">
                        /products/
                        {isNew
                          ? slugFromLabel(name) || "…"
                          : slugDraft || loadedSlug || slugFromLabel(name) || "…"}
                      </code>
                    </span>
                    {!isNew && loadedSlug ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          const next = slugFromLabel(name);
                          if (!next) {
                            toast.error("Name needs letters or numbers to build a URL.");
                            return;
                          }
                          if (next === (slugDraft || loadedSlug)) {
                            toast.message("URL already matches this name.");
                            return;
                          }
                          if (
                            !window.confirm(
                              `Change URL from\n/products/${loadedSlug}\nto\n/products/${next}\n\nA 301 redirect will be saved on Save. Continue?`,
                            )
                          ) {
                            return;
                          }
                          setSlugDraft(next);
                          toast.message("URL will update when you save.");
                        }}
                      >
                        Regenerate URL from name
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-2 sm:max-w-xs">
                  <Label htmlFor="status">Status</Label>
                  <NativeSelect
                    id="status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as "draft" | "active")}
                  >
                    <option value="draft">Draft — hidden from storefront</option>
                    <option value="active">Active — visible to customers</option>
                  </NativeSelect>
                  <p className="text-xs text-muted-foreground">
                    Draft products are not shown on the live catalog.
                  </p>
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-input/70 bg-muted/10 p-4 sm:col-span-2">
                  <Checkbox
                    id="free-delivery"
                    checked={freeDelivery}
                    onCheckedChange={(c) => setFreeDelivery(c === true)}
                  />
                  <div className="min-w-0 space-y-1">
                    <Label htmlFor="free-delivery" className="cursor-pointer text-sm font-medium">
                      Free delivery for this product only
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      This line&apos;s total is excluded from standard delivery and from cart
                      free-delivery thresholds. Other items in the same order still follow normal
                      shipping rules.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="short">Short description</Label>
                <Input
                  id="short"
                  value={shortDescription}
                  onChange={(e) => setShortDescription(e.target.value)}
                  placeholder="One line for cards and SEO"
                />
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Collections</p>
              <p className="text-xs text-muted-foreground">
                Leave none selected to show this product only under &quot;All products&quot;. Tag-based
                collections are filled automatically from product tags — assign those in the Tags
                section below.
              </p>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-input/80 bg-muted/10 p-4 dark:bg-muted/5">
                {collections.filter((c) => !collectionIsTagBased(c.collection_type)).length ===
                0 ? (
                  <p className="text-sm text-muted-foreground">
                    No manual collections yet — create some under Collections (or use tag-based
                    collections with tags below).
                  </p>
                ) : (
                  collections
                    .filter((c) => !collectionIsTagBased(c.collection_type))
                    .map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md py-1 text-sm transition-colors hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={selectedCollectionIds.has(c.id)}
                        onCheckedChange={(checked) => {
                          setSelectedCollectionIds((prev) => {
                            const next = new Set(prev);
                            if (checked === true) next.add(c.id);
                            else next.delete(c.id);
                            return next;
                          });
                        }}
                      />
                      <span>
                        <span className="font-medium">{c.name}</span>{" "}
                        <span className="text-muted-foreground">({c.slug})</span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
        </ProductFormSection>

        <ProductFormSection
          step={2}
          title="Long description"
          description="Rich text is stored as HTML and shown on the product page with the same formatting."
        >
          <div className="space-y-2">
            <Label htmlFor="desc" className="sr-only">
              Description
            </Label>
            <ProductDescriptionEditor
              id="desc"
              value={description}
              onChange={setDescription}
            />
          </div>
        </ProductFormSection>

        <ProductFormSection
          step={3}
          title="Media gallery"
          description={
            <>
              Images and videos (MP4, WebM, MOV). Uploads go to{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.75rem]">products/media/</code> or
              paste an external URL. The first asset is used on product cards.
            </>
          }
        >
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="product-video-url">Sticky reel video URL (optional)</Label>
                  <Input
                    id="product-video-url"
                    type="url"
                    inputMode="url"
                    placeholder="https://www.instagram.com/reels/… or https://…/video.mp4"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste an <strong>Instagram</strong> reel/post URL (or a direct MP4 link). The
                    storefront plays it as a muted looping video — no Instagram UI. YouTube /
                    Facebook are not supported.
                  </p>
                </div>
                {assets.map((row, i) => (
                  <div
                    key={row.key}
                    className="rounded-xl border border-border/80 bg-card p-4 shadow-sm space-y-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <NativeSelect
                        containerClassName="w-[min(100%,9rem)] shrink-0"
                        value={row.kind}
                        onChange={(e) => {
                          const k = e.target.value as "image" | "video";
                          setAssets((prev) =>
                            prev.map((r) => (r.key === row.key ? { ...r, kind: k } : r)),
                          );
                        }}
                      >
                        <option value="image">Image</option>
                        <option value="video">Video</option>
                      </NativeSelect>
                      <Input
                        type="file"
                        accept="image/*,video/mp4,video/webm,video/quicktime"
                        disabled={uploadingAssetKey === row.key}
                        onChange={(e) => void onAssetFile(row.key, e)}
                        className="max-w-[220px] cursor-pointer text-xs file:mr-2"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={i === 0}
                        onClick={() => moveAsset(i, -1)}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={i === assets.length - 1}
                        onClick={() => moveAsset(i, 1)}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() =>
                          setAssets((prev) => prev.filter((r) => r.key !== row.key))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Media URL</Label>
                      <Input
                        placeholder="https://…"
                        value={row.url}
                        onChange={(e) => {
                          const v = e.target.value;
                          setAssets((prev) =>
                            prev.map((r) => (r.key === row.key ? { ...r, url: v } : r)),
                          );
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Alt text (optional)</Label>
                      <Input
                        value={row.alt_text}
                        onChange={(e) => {
                          const v = e.target.value;
                          setAssets((prev) =>
                            prev.map((r) => (r.key === row.key ? { ...r, alt_text: v } : r)),
                          );
                        }}
                      />
                    </div>
                    {row.url ? (
                      <div className="text-xs text-muted-foreground truncate">{row.url}</div>
                    ) : null}
                    {uploadingAssetKey === row.key ? (
                      <p className="text-xs text-muted-foreground">Uploading…</p>
                    ) : null}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAssets((a) => [...a, newAssetRow()])}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add media row
                </Button>
              </div>
        </ProductFormSection>
          </div>

          <div className="min-w-0 space-y-8" aria-label="Storefront, pricing, and discovery">
        <ProductFormSection
          step={4}
          title="PDP option labels (size & color)"
          description={
            <>
              How pickers appear on the product page. Keys must match your variant matrix{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8rem]">option_values</code> — only{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8rem]">size</code> and{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8rem]">color</code> (one row each).
            </>
          }
        >
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={addDimensionRow}
                disabled={!canAddStorefrontDimension}
                title={
                  !canAddStorefrontDimension
                    ? "You already have size and color rows."
                    : undefined
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add dimension
              </Button>
              {variants.length > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onMergeKeysFromVariantForm}
                >
                  Merge keys from variant rows
                </Button>
              ) : null}
              {!isNew ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void onRefreshVariantKeysFromDb()}
                >
                  Sync from saved product
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Merge from variant rows</span> adds{" "}
              <code className="text-[0.75rem]">size</code> / <code className="text-[0.75rem]">color</code> when
              your matrix uses them, without removing rows you added manually.{" "}
              {!isNew ? (
                <>
                  <span className="font-medium text-foreground">Sync from saved product</span> pulls the latest{" "}
                  <code className="text-[0.75rem]">option_values</code> from what is already stored for this product.
                </>
              ) : null}
            </p>
            {variantOptionSchema.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No dimensions yet — click <span className="font-medium text-foreground">Add dimension</span> or{" "}
                <span className="font-medium text-foreground">Merge keys from variant rows</span> after adding
                variants.
              </p>
            ) : (
              <div className="space-y-3">
                {variantOptionSchema.map((row, i) => {
                  const keyOptions = allowedKeysForRow(variantOptionSchema, i);
                  const keyValue = isStorefrontDimensionKey(row.key.trim())
                    ? row.key.trim()
                    : "";
                  return (
                  <div
                    key={`dim-row-${i}-${row.key || "new"}`}
                    className="flex flex-col gap-4 rounded-xl border border-border/80 bg-muted/15 p-4 sm:flex-row sm:flex-wrap sm:items-end dark:bg-muted/10"
                  >
                    <div className="min-w-0 space-y-2 sm:w-36">
                      <Label htmlFor={`vopt-key-${i}`} className="text-xs font-medium text-foreground">
                        Option key
                      </Label>
                      <NativeSelect
                        id={`vopt-key-${i}`}
                        className="font-mono text-xs"
                        containerClassName="sm:w-36"
                        value={keyValue}
                        onChange={(e) => {
                          const v = e.target.value;
                          setVariantOptionSchema((prev) =>
                            prev.map((r, j) => {
                              if (j !== i) return r;
                              if (!isStorefrontDimensionKey(v)) {
                                return { ...r, key: "" };
                              }
                              const prevKey = r.key.trim();
                              const wasUnset = !isStorefrontDimensionKey(prevKey);
                              return {
                                ...r,
                                key: v,
                                label:
                                  r.label.trim() === "" || wasUnset
                                    ? v === "size"
                                      ? "Size"
                                      : "Color"
                                    : r.label,
                                presentation: wasUnset
                                  ? v === "color"
                                    ? "swatches"
                                    : "pills"
                                  : r.presentation,
                              };
                            }),
                          );
                        }}
                      >
                        <option value="">
                          {keyOptions.length ? "Select…" : "No keys left"}
                        </option>
                        {keyOptions.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                    <div className="min-w-0 flex-1 space-y-1 sm:min-w-[160px]">
                      <Label htmlFor={`vopt-label-${i}`}>Title on storefront</Label>
                      <Input
                        id={`vopt-label-${i}`}
                        value={row.label}
                        onChange={(e) => {
                          const v = e.target.value;
                          setVariantOptionSchema((prev) =>
                            prev.map((r, j) =>
                              j === i ? { ...r, label: v } : r,
                            ),
                          );
                        }}
                        placeholder="e.g. Choose size"
                      />
                    </div>
                    <div className="space-y-2 sm:w-48">
                      <Label htmlFor={`vopt-pres-${i}`}>Presentation</Label>
                      <NativeSelect
                        id={`vopt-pres-${i}`}
                        containerClassName="sm:w-48"
                        value={row.presentation}
                        onChange={(e) => {
                          const presentation = e.target
                            .value as VariantOptionSchemaEntry["presentation"];
                          setVariantOptionSchema((prev) =>
                            prev.map((r, j) =>
                              j === i ? { ...r, presentation } : r,
                            ),
                          );
                        }}
                      >
                        <option value="pills">Large buttons</option>
                        <option value="badges">Compact badges</option>
                        <option value="swatches">Swatches (color dots)</option>
                        <option value="dropdown">Dropdown</option>
                      </NativeSelect>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        disabled={i === 0}
                        onClick={() => moveSchemaRow(i, -1)}
                        aria-label="Move up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        disabled={i === variantOptionSchema.length - 1}
                        onClick={() => moveSchemaRow(i, 1)}
                        aria-label="Move down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-destructive"
                        onClick={() => removeDimensionRow(i)}
                        aria-label="Remove dimension"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </ProductFormSection>

        <ProductFormSection
          step={5}
          className={cn(
            "border-l-4 border-l-primary/40 bg-muted/10 dark:bg-muted/5",
          )}
          cardHeaderClassName="bg-muted/20 dark:bg-muted/10"
          title={
            <span className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Layers className="h-5 w-5 shrink-0" aria-hidden />
              </span>
              Pricing &amp; SKUs
            </span>
          }
          description={
            variants.length === 0 ? (
              <>
                One SKU covers the whole product. Use{" "}
                <span className="font-medium text-foreground">Add variant</span> when you need
                separate size/color rows.
              </>
            ) : (
              <>
                Each row is a sellable SKU: pick{" "}
                <Link to="/dashboard/sizes" className="underline underline-offset-2">
                  size
                </Link>{" "}
                and/or{" "}
                <Link to="/dashboard/colors" className="underline underline-offset-2">
                  color
                </Link>{" "}
                (at least one per row), then SKU, price, compare-at, and stock.
              </>
            )
          }
          headerRight={
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() =>
                setVariants((v) => {
                  if (v.length === 0) {
                    const seed = Number.parseInt(parentStock, 10);
                    const stockSeed =
                      !Number.isNaN(seed) && seed >= 0 ? String(seed) : "0";
                    const row: VariantForm = {
                      id: simpleVariantId ?? undefined,
                      sku: simpleSku.trim(),
                      sizeId: "",
                      colorId: "",
                      price: simplePrice.trim() === "" ? "0" : simplePrice,
                      compareAt: simpleCompareAt,
                      stock: stockSeed,
                    };
                    return [row];
                  }
                  return [...v, emptyVariant()];
                })
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Add variant
            </Button>
          }
        >
          <div className="rounded-xl border border-border/80 bg-muted/20 p-4 dark:bg-muted/10">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Inventory
                </p>
                <p className="text-xs text-muted-foreground">
                  {variants.length > 0
                    ? "Total is the sum of per-variant stock in the rows below. Set every variant to 0 to show Sold out on the storefront."
                    : "For a single-SKU product, enter total units available to sell (used when you add variants or for internal totals)."}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => {
                  if (variants.length > 0) {
                    setVariants((rows) => rows.map((row) => ({ ...row, stock: "0" })));
                  } else {
                    setParentStock("0");
                  }
                  toast.message("All stock set to 0 — click Save product to update the storefront.");
                }}
              >
                Mark out of stock
              </Button>
            </div>
            <div className="space-y-2 sm:max-w-md">
              <Label htmlFor="parent-stock">
                {variants.length > 0 ? "Total inventory (calculated)" : "Total inventory (units)"}
              </Label>
              {variants.length > 0 ? (
                <p
                  id="parent-stock"
                  className="flex h-10 items-center rounded-lg border border-input bg-muted/40 px-3 text-sm tabular-nums dark:bg-muted/20"
                  aria-live="polite"
                >
                  {matrixStockSumDisplay} units across {variants.length} variant
                  {variants.length === 1 ? "" : "s"}
                </p>
              ) : (
                <Input
                  id="parent-stock"
                  value={parentStock}
                  onChange={(e) => setParentStock(e.target.value)}
                  inputMode="numeric"
                  placeholder="0"
                />
              )}
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-primary/15 bg-primary/4 p-4 dark:bg-primary/10 sm:flex-row sm:flex-wrap sm:items-center">
            <p className="min-w-0 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Catalog shortcuts:</span> create a size or
              color here — it appears in variant dropdowns on this page immediately.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setQuickSizeOpen(true)}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                New size
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setQuickColorOpen(true)}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                New color
              </Button>
            </div>
          </div>
            {variants.length === 0 ? (
              <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm sm:p-5">
                <p className="mb-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Single SKU (no size/color matrix)
                </p>
                <div className="space-y-6">
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="simple-sku">SKU</Label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                      <Input
                        id="simple-sku"
                        value={simpleSku}
                        onChange={(e) => setSimpleSku(e.target.value)}
                        className="min-w-0 w-full flex-1 font-mono text-xs"
                        placeholder={`${prefixFromStoreName(storeDisplayName)}-123-4567`}
                        autoComplete="off"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-10 w-full shrink-0 sm:w-auto sm:min-w-38"
                        disabled={generatingSimpleSku}
                        onClick={() => void onGenerateSimpleSku()}
                      >
                        {generatingSimpleSku ? "…" : "Generate SKU"}
                      </Button>
                    </div>
                    <p className="text-[0.65rem] leading-relaxed text-muted-foreground">
                      Saved as one variant with no size or color.{" "}
                      <span className="font-mono text-[0.7rem]">
                        {prefixFromStoreName(storeDisplayName)}-###-####
                      </span>
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="min-w-0 space-y-2">
                      <Label htmlFor="simple-price">Price</Label>
                      <Input
                        id="simple-price"
                        value={simplePrice}
                        onChange={(e) => setSimplePrice(e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <Label htmlFor="simple-compare">Compare-at</Label>
                      <Input
                        id="simple-compare"
                        value={simpleCompareAt}
                        onChange={(e) => setSimpleCompareAt(e.target.value)}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            {variants.length > 0 && sizes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No sizes defined yet — you can still save{" "}
                <span className="font-medium text-foreground">color-only</span> variants, or add
                sizes under{" "}
                <Link to="/dashboard/sizes" className="underline underline-offset-2">
                  Sizes
                </Link>
                .
              </p>
            ) : null}
            {variants.length > 0 && colors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No colors defined yet — you can still save{" "}
                <span className="font-medium text-foreground">size-only</span> variants, or add
                swatches under{" "}
                <Link to="/dashboard/colors" className="underline underline-offset-2">
                  Colors
                </Link>
                .
              </p>
            ) : null}
            {variants.map((v, i) => (
              <div
                key={i}
                className="rounded-xl border border-border/80 bg-card p-4 shadow-sm sm:p-5"
              >
                <p className="mb-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Child variant {i + 1}
                  {name.trim() ? (
                    <span className="font-normal normal-case text-muted-foreground">
                      {" "}
                      · under “{name.trim()}”
                    </span>
                  ) : null}
                </p>

                <div className="space-y-6">
                  {/* Size & color: two columns on sm+, stacked on narrow screens */}
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
                    <div className="min-w-0 space-y-2">
                      <Label htmlFor={`variant-${i}-size`}>Size (optional)</Label>
                      <NativeSelect
                        id={`variant-${i}-size`}
                        value={v.sizeId}
                        onChange={(e) => {
                          const next = [...variants];
                          next[i] = { ...next[i], sizeId: e.target.value };
                          setVariants(next);
                        }}
                      >
                        <option value="">— None —</option>
                        {sizeChoices(sizes, v.sizeId).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.display_name}
                            {!s.is_active ? " (inactive)" : ""}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                    <div className="min-w-0 space-y-2">
                      <Label htmlFor={`variant-${i}-color`}>Color (optional)</Label>
                      <NativeSelect
                        id={`variant-${i}-color`}
                        value={v.colorId}
                        onChange={(e) => {
                          const next = [...variants];
                          next[i] = { ...next[i], colorId: e.target.value };
                          setVariants(next);
                        }}
                      >
                        <option value="">— None —</option>
                        {colorChoices(colors, v.colorId).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                            {!c.is_active ? " (inactive)" : ""}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  </div>

                  <div className="border-t border-border/60 pt-6">
                    <div className="min-w-0 space-y-2">
                      <Label htmlFor={`variant-${i}-sku`}>SKU</Label>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                        <Input
                          id={`variant-${i}-sku`}
                          value={v.sku}
                          onChange={(e) => {
                            const next = [...variants];
                            next[i] = { ...next[i], sku: e.target.value };
                            setVariants(next);
                          }}
                          className="min-w-0 w-full flex-1 font-mono text-xs"
                          placeholder={`${prefixFromStoreName(storeDisplayName)}-123-4567`}
                          autoComplete="off"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-10 w-full shrink-0 sm:w-auto sm:min-w-38"
                          disabled={generatingSkuIndex === i}
                          onClick={() => void onGenerateSku(i)}
                        >
                          {generatingSkuIndex === i ? "…" : "Generate SKU"}
                        </Button>
                      </div>
                      <p className="text-[0.65rem] leading-relaxed text-muted-foreground">
                        Type any SKU, or generate{" "}
                        <span className="font-mono text-[0.7rem]">
                          {prefixFromStoreName(storeDisplayName)}-###-####
                        </span>{" "}
                        (store prefix from “{storeDisplayName}”, then numeric segments; must be unique across
                        your store).
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 border-t border-border/60 pt-6 sm:grid-cols-3 sm:gap-4">
                    <div className="min-w-0 space-y-2">
                      <Label htmlFor={`variant-${i}-price`}>Price</Label>
                      <Input
                        id={`variant-${i}-price`}
                        value={v.price}
                        onChange={(e) => {
                          const next = [...variants];
                          next[i] = { ...next[i], price: e.target.value };
                          setVariants(next);
                        }}
                        className="w-full"
                      />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <Label htmlFor={`variant-${i}-compare`}>Compare-at</Label>
                      <Input
                        id={`variant-${i}-compare`}
                        value={v.compareAt}
                        onChange={(e) => {
                          const next = [...variants];
                          next[i] = { ...next[i], compareAt: e.target.value };
                          setVariants(next);
                        }}
                        className="w-full"
                      />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <Label htmlFor={`variant-${i}-stock`}>Stock</Label>
                      <Input
                        id={`variant-${i}-stock`}
                        value={v.stock}
                        inputMode="numeric"
                        onChange={(e) => {
                          const next = [...variants];
                          next[i] = { ...next[i], stock: e.target.value };
                          setVariants(next);
                        }}
                        className="w-full"
                      />
                      <p className="text-[0.65rem] text-muted-foreground">Units for this SKU</p>
                    </div>
                  </div>

                  <div className="border-t border-border/60 pt-4">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => setVariants((rows) => rows.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Remove this variant
                    </Button>
                  </div>
                </div>
              </div>
            ))}
        </ProductFormSection>

        <ProductFormSection
          step={6}
          title="Tags & search"
          description="Storefront search matches product title, descriptions, tags, SKUs, and the extra keywords below."
        >
          <div className="space-y-2">
            <Label htmlFor="product-search-keywords">Extra search keywords</Label>
            <AdminTextarea
              id="product-search-keywords"
              value={searchKeywordsExtra}
              onChange={(e) => setSearchKeywordsExtra(e.target.value)}
              rows={4}
              placeholder="e.g. presser foot, sewing machine attachment, zipper foot, daraz alternative"
            />
            <p className="text-xs text-muted-foreground">
              Comma or line-separated terms shoppers might type. On save we also auto-add the product
              name, slug, tags, SKUs, and description words.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="product-tags-multiselect">Tags</Label>
            <TagMultiSelect
              inputId="product-tags-multiselect"
              tags={catalogTags}
              value={selectedTagIds}
              onChange={setSelectedTagIds}
              onTagCreated={(newTag) => {
                setCatalogTags((prev) =>
                  [...prev.filter((t) => t.id !== newTag.id), newTag].sort((a, b) =>
                    a.label.localeCompare(b.label),
                  ),
                );
              }}
              aria-label="Product tags"
            />
            <p className="text-xs text-muted-foreground">
              Search existing tags or type a new tag name to create and assign it instantly.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Rating (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Click stars for half steps (0.5–5). Use Clear to remove the rating.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <StarRatingInput
                  key={productId ?? "new"}
                  count={5}
                  value={rating}
                  size={28}
                  color="#94a3b8"
                  activeColor="#eab308"
                  isHalf
                  edit
                  onChange={(v: number) => setRating(v)}
                />
                <span className="text-sm text-muted-foreground tabular-nums">
                  {rating > 0 ? `${rating.toFixed(1)} / 5.0` : "No rating"}
                </span>
                {rating > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-muted-foreground"
                    onClick={() => setRating(0)}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reviews">Reviews count (optional)</Label>
              <Input
                id="reviews"
                value={reviewsCount}
                onChange={(e) => setReviewsCount(e.target.value)}
                inputMode="numeric"
                placeholder="0"
              />
            </div>
          </div>
        </ProductFormSection>
          </div>
        </div>

        <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-xl border border-border/80 bg-background/95 p-4 shadow-lg shadow-black/5 backdrop-blur-md dark:bg-card/95 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-muted-foreground">
            Save updates the parent product and all variant rows in one step.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              disabled={saving || uploadingAssetKey !== null || generatingSimpleSku}
            >
              {saving ? "Saving…" : "Save product & variants"}
            </Button>
            {!isNew ? (
              <Button type="button" variant="destructive" onClick={() => void onDelete()}>
                Delete product
              </Button>
            ) : null}
          </div>
        </div>
      </form>

      {!isNew && productId ? (
        <div className="mt-8 space-y-6">
          <ProductShoppingAttributesSection
            productId={productId}
            productSlug={loadedSlug}
          />
          <SeoFieldsSection
            subjectType="product"
            subjectId={productId}
            revalidate={loadedSlug ? { productSlug: loadedSlug } : null}
          />
        </div>
      ) : null}
    </div>
    <QuickAddSizeDialog
      open={quickSizeOpen}
      onOpenChange={setQuickSizeOpen}
      existingSizes={sizes}
      onCreated={mergeSizeIntoState}
    />
    <QuickAddColorDialog
      open={quickColorOpen}
      onOpenChange={setQuickColorOpen}
      existingColors={colors}
      onCreated={mergeColorIntoState}
    />
    </Fragment>
  );
}
