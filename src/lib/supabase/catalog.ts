import { buildProductSearchKeywords } from "@/lib/product-search-keywords";
import { supabase } from "@/lib/supabase/client";
import { ADMIN_MSG_CATALOG_UNAVAILABLE } from "@/lib/admin-user-messages";
import type {
  ColorRow,
  CollectionRow,
  HomePageSectionRow,
  ProductAssetRow,
  ProductRow,
  ProductVariantDbRow,
  ProductVariantRow,
  SizeRow,
  TagRow,
} from "@/lib/supabase/catalog-types";
import { CollectionTypeDb, collectionIsTagBased } from "@/lib/catalog/collection-type";
import {
  optionDefinitionsFromDbRows,
  type VariantOptionSchemaEntry,
} from "@/lib/variant-option-schema";

let warnedMissingCatalog = false;

function isMissingSchemaError(msg: string | undefined): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return (
    m.includes("could not find the table") ||
    m.includes("schema cache") ||
    m.includes("pgrst205") ||
    m.includes("does not exist") ||
    m.includes("not found")
  );
}

/** Avoid spamming the console when the catalog schema is not present yet. */
function logCatalogIssue(op: string, message: string | undefined) {
  if (!message) return;
  if (isMissingSchemaError(message)) {
    if (!warnedMissingCatalog) {
      warnedMissingCatalog = true;
      console.warn(
        "[catalog] Catalog tables were not found. Deploy the storefront database schema to this project, then reload.",
      );
    }
    return;
  }
  console.error(`[catalog] ${op}`, message);
}

/** Singleton row (id = 1) — used for SKU prefix, etc. */
export async function fetchStoreNameForSku(): Promise<string> {
  if (!supabase) return "Store";
  const { data, error } = await supabase
    .from("store_settings")
    .select("store_name")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    logCatalogIssue("fetchStoreName", error.message);
    return "Store";
  }
  const name = (data as { store_name?: string } | null)?.store_name?.trim();
  return name || "Store";
}

export async function fetchCollections(): Promise<CollectionRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("collections")
    .select("id, slug, name, description, hero_image, sort_order, collection_type")
    .order("sort_order", { ascending: true });
  if (error) {
    logCatalogIssue("fetchCollections", error.message);
    return [];
  }
  return (data ?? []) as CollectionRow[];
}

export type TagWithCountRow = TagRow & {
  product_count: number;
};

export async function fetchTags(): Promise<TagRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("tags")
    .select("id, name, label, created_at, updated_at")
    .order("label", { ascending: true });
  if (error) {
    logCatalogIssue("fetchTags", error.message);
    return [];
  }
  return (data ?? []) as TagRow[];
}

export async function fetchTagsWithProductCount(): Promise<TagWithCountRow[]> {
  if (!supabase) return [];
  const [tagsRes, ptRes] = await Promise.all([
    supabase
      .from("tags")
      .select("id, name, label, created_at, updated_at")
      .order("label", { ascending: true }),
    supabase.from("product_tags").select("tag_id"),
  ]);
  if (tagsRes.error) {
    logCatalogIssue("fetchTagsWithProductCount", tagsRes.error.message);
    return [];
  }
  const tagList = (tagsRes.data ?? []) as TagRow[];
  const counts = new Map<string, number>();
  for (const r of ptRes.data ?? []) {
    const tid = (r as { tag_id: string }).tag_id;
    counts.set(tid, (counts.get(tid) ?? 0) + 1);
  }
  return tagList.map((t) => ({
    ...t,
    product_count: counts.get(t.id) ?? 0,
  }));
}

export async function fetchTagById(id: string): Promise<TagRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("tags")
    .select("id, name, label, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    logCatalogIssue("fetchTagById", error.message);
    return null;
  }
  return data as TagRow | null;
}

export type ProductCatalogTagRef = {
  id: string;
  /** Display label from `tags.label`. */
  label: string;
};

export async function fetchProductsWithVariantCount(): Promise<
  (ProductRow & { variant_count: number; catalog_tags: ProductCatalogTagRef[] })[]
> {
  if (!supabase) return [];
  const { data: products, error: pErr } = await supabase
    .from("products")
    .select(
      "id, slug, name, short_description, description, status, images, tags, rating, reviews_count, stock_total, free_delivery, video_url, search_keywords, search_keywords_extra, created_at, updated_at",
    )
    .order("updated_at", { ascending: false });
  if (pErr || !products) {
    logCatalogIssue("fetchProducts", pErr?.message);
    return [];
  }
  const plist = products as ProductRow[];
  if (!plist.length) return [];

  const ids = plist.map((p) => p.id);
  const { data: counts } = await supabase
    .from("product_variants")
    .select("product_id")
    .in("product_id", ids);

  const nByProduct = new Map<string, number>();
  for (const row of counts ?? []) {
    const pid = (row as { product_id: string }).product_id;
    nByProduct.set(pid, (nByProduct.get(pid) ?? 0) + 1);
  }

  const { data: ptRows } = await supabase
    .from("product_tags")
    .select("product_id, tag_id")
    .in("product_id", ids);

  const allTagIds = [
    ...new Set((ptRows ?? []).map((r: { tag_id: string }) => r.tag_id)),
  ];
  const tagMetaById = new Map<string, ProductCatalogTagRef>();
  if (allTagIds.length) {
    const { data: tagRows, error: tagErr } = await supabase
      .from("tags")
      .select("id, label")
      .in("id", allTagIds);
    if (tagErr) {
      logCatalogIssue("fetchTagsForProductList", tagErr.message);
    } else {
      for (const t of tagRows ?? []) {
        const row = t as { id: string; label: string };
        tagMetaById.set(row.id, { id: row.id, label: row.label });
      }
    }
  }

  const tagsByProduct = new Map<string, ProductCatalogTagRef[]>();
  for (const r of ptRows ?? []) {
    const pid = (r as { product_id: string; tag_id: string }).product_id;
    const tid = (r as { product_id: string; tag_id: string }).tag_id;
    const meta = tagMetaById.get(tid);
    if (!meta) continue;
    const list = tagsByProduct.get(pid) ?? [];
    list.push(meta);
    tagsByProduct.set(pid, list);
  }

  return plist.map((p) => {
    const raw = tagsByProduct.get(p.id) ?? [];
    const seen = new Set<string>();
    const catalog_tags = raw
      .filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    const fromLegacy =
      catalog_tags.length === 0 && p.tags?.length
        ? p.tags.map((name) => ({
            id: `legacy:${name}`,
            label: name,
          }))
        : [];

    return {
      ...p,
      variant_count: nByProduct.get(p.id) ?? 0,
      catalog_tags: catalog_tags.length ? catalog_tags : fromLegacy,
    };
  });
}

export async function fetchProductWithVariants(
  productId: string,
): Promise<{
  product: ProductRow;
  variants: ProductVariantRow[];
  collectionIds: string[];
  tagIds: string[];
  assets: ProductAssetRow[];
} | null> {
  if (!supabase) return null;
  const { data: product, error: pErr } = await supabase
    .from("products")
    .select(
      "id, slug, name, short_description, description, status, images, tags, rating, reviews_count, stock_total, free_delivery, video_url, search_keywords, search_keywords_extra, created_at, updated_at",
    )
    .eq("id", productId)
    .maybeSingle();
  if (pErr || !product) {
    logCatalogIssue("fetchProduct", pErr?.message);
    return null;
  }

  const { data: pcRows } = await supabase
    .from("product_collections")
    .select("collection_id")
    .eq("product_id", productId);
  const rawCollectionIds = (pcRows ?? []).map(
    (r: { collection_id: string }) => r.collection_id,
  );
  let collectionIds = rawCollectionIds;
  if (rawCollectionIds.length) {
    const { data: colMeta } = await supabase
      .from("collections")
      .select("id, collection_type")
      .in("id", rawCollectionIds);
    const manual = new Set(
      (colMeta ?? [])
        .filter((c: { collection_type?: string }) => !collectionIsTagBased(c.collection_type))
        .map((c: { id: string }) => c.id),
    );
    collectionIds = rawCollectionIds.filter((id) => manual.has(id));
  }

  const { data: ptRows } = await supabase
    .from("product_tags")
    .select("tag_id")
    .eq("product_id", productId);
  const tagIdsSet = new Set<string>((ptRows ?? []).map((r: { tag_id: string }) => r.tag_id));

  // If product has legacy or denormalized text tags, resolve their IDs from public.tags
  const legacyTags = Array.isArray(product.tags) ? product.tags : [];
  if (legacyTags.length > 0) {
    const catalogStringTags = legacyTags
      .filter(
        (t): t is string =>
          typeof t === "string" &&
          t.trim() !== "" &&
          !t.startsWith("daraz:") &&
          !t.startsWith("rating_breakdown:"),
      )
      .map((t) => t.trim().toLowerCase());

    if (catalogStringTags.length > 0) {
      const { data: matchedTags } = await supabase
        .from("tags")
        .select("id, name")
        .in("name", catalogStringTags);

      for (const mt of matchedTags ?? []) {
        tagIdsSet.add(mt.id);
      }
    }
  }
  const tagIds = Array.from(tagIdsSet);

  const { data: assetRows } = await supabase
    .from("product_assets")
    .select("id, product_id, url, kind, sort_order, alt_text")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });

  const { data: rawVariants, error: vErr } = await supabase
    .from("product_variants")
    .select(
      "id, product_id, sku, option_values, price, compare_at_price, size_id, color_id",
    )
    .eq("product_id", productId)
    .order("sku", { ascending: true });
  if (vErr) {
    logCatalogIssue("fetchVariants", vErr.message);
    return null;
  }
  const base = (rawVariants ?? []) as ProductVariantDbRow[];
  const ids = base.map((v) => v.id);
  let merged: ProductVariantRow[] = [];
  if (ids.length) {
    const { data: inv } = await supabase
      .from("inventory")
      .select("product_variant_id, quantity_on_hand, quantity_reserved")
      .in("product_variant_id", ids);
    const byId = new Map(
      (inv ?? []).map(
        (r: {
          product_variant_id: string;
          quantity_on_hand: number;
          quantity_reserved: number;
        }) => [r.product_variant_id, r],
      ),
    );
    merged = base.map((v) => {
      const row = byId.get(v.id);
      return {
        ...v,
        quantity_on_hand: row?.quantity_on_hand ?? 0,
        quantity_reserved: row?.quantity_reserved ?? 0,
      };
    });
  }
  const { data: optRows, error: optErr } = await supabase
    .from("product_option_definitions")
    .select("option_key, label, presentation, sort_order")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });
  if (optErr) {
    logCatalogIssue("fetchProductOptionDefinitions", optErr.message);
  }

  return {
    product: {
      ...(product as ProductRow),
      option_definitions: optionDefinitionsFromDbRows(
        optRows as
          | {
              option_key: string;
              label: string;
              presentation: string;
              sort_order: number;
            }[]
          | null,
      ),
    },
    variants: merged,
    collectionIds,
    tagIds,
    assets: (assetRows ?? []) as ProductAssetRow[],
  };
}

export type ProductAssetPayload = {
  url: string;
  kind: "image" | "video";
  alt_text: string;
  sort_order: number;
};

export type ProductSavePayload = {
  /** Any number of collections; empty = only in “All products” on the storefront. */
  collection_ids: string[];
  /** Normalized tags (public.tags ids); also syncs `products.tags` text[] for legacy readers. */
  tag_ids: string[];
  slug: string;
  name: string;
  short_description: string;
  description: string;
  status: "draft" | "active";
  /** Gallery; `products.images` jsonb is derived from image rows for legacy storefront use. */
  assets: ProductAssetPayload[];
  rating: number | null;
  reviews_count: number | null;
  stock_total: number;
  /** When true, this product's line is excluded from standard delivery / threshold basis. */
  free_delivery: boolean;
  /** Sticky promo video URL for storefront (YouTube / Facebook / Instagram / MP4). Empty clears. */
  video_url: string | null;
  /** Manual extra search terms (merged into search_keywords on save). */
  search_keywords_extra: string;
  /** PDP: labels and presentation per `option_values` key (normalized table). */
  option_definitions: VariantOptionSchemaEntry[];
};

export type VariantSavePayload = {
  /** Existing `product_variants.id` when editing — omit for new rows. */
  id?: string | null;
  sku: string;
  option_values: Record<string, string>;
  /** Optional FK to public.sizes */
  size_id: string | null;
  /** Optional FK to public.colors */
  color_id: string | null;
  price: number;
  compare_at_price: number | null;
  /** maps to inventory.quantity_on_hand */
  quantity_on_hand: number;
};

type DbVariantSyncRow = {
  id: string;
  sku: string;
  size_id: string | null;
  color_id: string | null;
  option_values: Record<string, unknown> | null;
};

function normVariantFk(x: string | null | undefined): string | null {
  const t = (x ?? "").trim();
  return t === "" ? null : t;
}

function optionValuesCompatibleWithDb(
  payload: Record<string, string>,
  db: Record<string, unknown> | null | undefined,
): boolean {
  const d = db && typeof db === "object" ? db : {};
  for (const [k, v] of Object.entries(payload)) {
    if (String(d[k] ?? "") !== String(v)) return false;
  }
  return true;
}

function friendlyVariantConstraintError(
  err: { message?: string; code?: string } | null | undefined,
): string {
  const msg = err?.message ?? "";
  const code = err?.code ?? "";
  if (
    code === "23505" ||
    msg.includes("product_variants_product_id_sku") ||
    (msg.includes("duplicate key") && msg.toLowerCase().includes("sku"))
  ) {
    return "Another variant of this product already uses that SKU. Each variant needs a unique SKU; if you reordered rows, reload the editor and save again.";
  }
  return msg || "Variant save failed.";
}

/**
 * Re-attach DB variant ids when the client omitted or lost `id` but size/color/SKU still match a row.
 */
function resolveVariantIdsForSync(
  variants: VariantSavePayload[],
  dbList: DbVariantSyncRow[],
): { resolved: VariantSavePayload[]; error?: string } {
  const dbIds = new Set(dbList.map((r) => r.id));
  const claimed = new Set<string>();
  const resolved: VariantSavePayload[] = [];

  for (const v of variants) {
    const raw = typeof v.id === "string" ? v.id.trim() : "";
    let vid: string | undefined;
    if (raw && dbIds.has(raw)) {
      vid = raw;
      claimed.add(raw);
    }
    resolved.push({ ...v, id: vid });
  }

  for (let i = 0; i < resolved.length; i++) {
    const v = resolved[i]!;
    if (v.id) continue;
    const m = dbList.find(
      (db) =>
        !claimed.has(db.id) &&
        normVariantFk(db.size_id) === normVariantFk(v.size_id) &&
        normVariantFk(db.color_id) === normVariantFk(v.color_id) &&
        optionValuesCompatibleWithDb(v.option_values, db.option_values),
    );
    if (m) {
      resolved[i] = { ...v, id: m.id };
      claimed.add(m.id);
    }
  }

  for (let i = 0; i < resolved.length; i++) {
    const v = resolved[i]!;
    if (v.id) continue;
    const skuKey = v.sku.trim().toLowerCase();
    if (!skuKey) continue;
    const m = dbList.find(
      (db) => !claimed.has(db.id) && db.sku.trim().toLowerCase() === skuKey,
    );
    if (m) {
      resolved[i] = { ...v, id: m.id };
      claimed.add(m.id);
    }
  }

  for (let i = 0; i < variants.length; i++) {
    const raw = typeof variants[i]!.id === "string" ? variants[i]!.id!.trim() : "";
    if (raw && !dbIds.has(raw) && !resolved[i]!.id) {
      return {
        resolved: [],
        error:
          "A variant row referenced an unknown id for this product. Reload the product editor and try again.",
      };
    }
  }

  return { resolved };
}

async function syncVariantsForExistingProduct(
  productId: string,
  variants: VariantSavePayload[],
): Promise<{ error?: string }> {
  if (!supabase) return { error: ADMIN_MSG_CATALOG_UNAVAILABLE };

  const { data: dbRows, error: fetchErr } = await supabase
    .from("product_variants")
    .select("id, sku, size_id, color_id, option_values")
    .eq("product_id", productId);
  if (fetchErr) return { error: fetchErr.message };

  const dbList = (dbRows ?? []) as DbVariantSyncRow[];
  const dbIds = new Set(dbList.map((r) => r.id));

  const { resolved, error: resolveErr } = resolveVariantIdsForSync(variants, dbList);
  if (resolveErr) return { error: resolveErr };

  const formIds = new Set(
    resolved.map((v) => v.id).filter((x): x is string => Boolean(x)),
  );

  const idsToRemove = dbList.map((r) => r.id).filter((vid) => !formIds.has(vid));
  for (const vid of idsToRemove) {
    const { data: oi, error: oiErr } = await supabase
      .from("order_items")
      .select("id")
      .eq("product_variant_id", vid)
      .limit(1)
      .maybeSingle();
    if (oiErr) return { error: oiErr.message };
    if (oi) {
      const sku = dbList.find((r) => r.id === vid)?.sku ?? vid;
      return {
        error: `Cannot remove variant “${sku}”: it appears on a customer order. Keep that SKU or leave stock at 0.`,
      };
    }
    const { error: dErr } = await supabase.from("product_variants").delete().eq("id", vid);
    if (dErr) return { error: dErr.message };
  }

  for (const vid of formIds) {
    const tmpSku = `__vrs__${vid.replace(/-/g, "")}`;
    const { error: stampErr } = await supabase
      .from("product_variants")
      .update({ sku: tmpSku })
      .eq("id", vid)
      .eq("product_id", productId);
    if (stampErr) return { error: friendlyVariantConstraintError(stampErr) };
  }

  for (const v of resolved) {
    const row = {
      product_id: productId,
      sku: v.sku.trim(),
      option_values: v.option_values,
      size_id: v.size_id && v.size_id !== "" ? v.size_id : null,
      color_id: v.color_id && v.color_id !== "" ? v.color_id : null,
      price: v.price,
      compare_at_price: v.compare_at_price,
    };

    if (v.id) {
      if (!dbIds.has(v.id)) {
        return {
          error: `Variant id mismatch — reload the product and try again (unknown id for this product).`,
        };
      }
      const { error: uErr } = await supabase
        .from("product_variants")
        .update(row)
        .eq("id", v.id)
        .eq("product_id", productId);
      if (uErr) return { error: friendlyVariantConstraintError(uErr) };

      const { data: inv, error: invFetchErr } = await supabase
        .from("inventory")
        .select("quantity_reserved")
        .eq("product_variant_id", v.id)
        .maybeSingle();
      if (invFetchErr) return { error: invFetchErr.message };
      const reserved =
        (inv as { quantity_reserved?: number } | null)?.quantity_reserved ?? 0;
      const qoh = Math.max(0, v.quantity_on_hand);
      if (qoh < reserved) {
        return {
          error: `Stock for “${v.sku.trim()}” cannot be below reserved units (${reserved}).`,
        };
      }

      if (!inv) {
        const { error: insInvErr } = await supabase.from("inventory").insert({
          product_variant_id: v.id,
          quantity_on_hand: qoh,
          quantity_reserved: 0,
        });
        if (insInvErr) return { error: insInvErr.message };
      } else {
        const { error: invUpErr } = await supabase
          .from("inventory")
          .update({
            quantity_on_hand: qoh,
            updated_at: new Date().toISOString(),
          })
          .eq("product_variant_id", v.id);
        if (invUpErr) return { error: invUpErr.message };
      }
    } else {
      const { data: ins, error: insErr } = await supabase
        .from("product_variants")
        .insert(row)
        .select("id")
        .single();
      if (insErr || !ins) {
        return { error: friendlyVariantConstraintError(insErr) };
      }
      const newId = (ins as { id: string }).id;
      const { error: invErr } = await supabase.from("inventory").insert({
        product_variant_id: newId,
        quantity_on_hand: Math.max(0, v.quantity_on_hand),
        quantity_reserved: 0,
      });
      if (invErr) return { error: invErr.message };
    }
  }

  return {};
}

export async function saveProductAndVariants(
  productId: string | null,
  product: ProductSavePayload,
  variants: VariantSavePayload[],
): Promise<{ id: string; error?: string }> {
  if (!supabase) {
    return { id: "", error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }

  const { collection_ids, assets, option_definitions, tag_ids, ...productRest } = product;
  const imageUrls = assets
    .filter((a) => a.kind === "image" && a.url.trim() !== "")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((a) => a.url.trim());

  let tagNames: string[] = [];
  let tagLabels: string[] = [];
  if (tag_ids.length && supabase) {
    const { data: tagRows, error: tagFetchErr } = await supabase
      .from("tags")
      .select("name, label")
      .in("id", tag_ids);
    if (tagFetchErr) {
      return { id: "", error: tagFetchErr.message };
    }
    tagNames = (tagRows ?? []).map((r: { name: string }) => r.name);
    tagLabels = (tagRows ?? []).map((r: { name: string; label: string }) => r.label || r.name);
  }

  // Preserve existing metadata/system tags (e.g. daraz:..., rating_breakdown:...) on update
  if (productId && supabase) {
    const { data: existingProd } = await supabase
      .from("products")
      .select("tags")
      .eq("id", productId)
      .maybeSingle();

    const existingTags = Array.isArray(existingProd?.tags) ? existingProd.tags : [];
    const metaTags = existingTags.filter(
      (t) => typeof t === "string" && (t.startsWith("daraz:") || t.startsWith("rating_breakdown:")),
    );
    for (const m of metaTags) {
      if (!tagNames.includes(m)) {
        tagNames.push(m);
      }
    }
  }

  const search_keywords = buildProductSearchKeywords({
    name: productRest.name,
    slug: productRest.slug,
    shortDescription: productRest.short_description,
    description: productRest.description,
    tagLabels,
    skus: variants.map((v) => v.sku).filter(Boolean),
    extra: product.search_keywords_extra,
  });

  const row = {
    ...productRest,
    search_keywords,
    images: imageUrls,
    tags: tagNames,
    updated_at: new Date().toISOString(),
  };

  let id = productId;

  if (!id) {
    const { data, error } = await supabase
      .from("products")
      .insert(row)
      .select("id")
      .single();
    if (error || !data) {
      return { id: "", error: error?.message ?? "Insert failed." };
    }
    id = (data as { id: string }).id;
  } else {
    const { error } = await supabase.from("products").update(row).eq("id", id);
    if (error) {
      return { id: "", error: error.message };
    }
  }

  const { error: ptDelErr } = await supabase
    .from("product_tags")
    .delete()
    .eq("product_id", id);
  if (ptDelErr) {
    return { id, error: ptDelErr.message };
  }
  if (tag_ids.length > 0) {
    const { error: ptInsErr } = await supabase.from("product_tags").insert(
      tag_ids.map((tag_id) => ({
        product_id: id,
        tag_id,
      })),
    );
    if (ptInsErr) {
      return { id, error: ptInsErr.message };
    }
  }

  let manualCollectionIds = collection_ids;
  if (collection_ids.length > 0) {
    const { data: colRows, error: colErr } = await supabase
      .from("collections")
      .select("id, collection_type")
      .in("id", collection_ids);
    if (colErr) {
      return { id, error: colErr.message };
    }
    const allowed = new Set(
      (colRows ?? [])
        .filter((c: { collection_type?: string }) => !collectionIsTagBased(c.collection_type))
        .map((c: { id: string }) => c.id),
    );
    manualCollectionIds = collection_ids.filter((cid) => allowed.has(cid));
  }

  const { error: pcDelErr } = await supabase
    .from("product_collections")
    .delete()
    .eq("product_id", id);
  if (pcDelErr) {
    return { id, error: pcDelErr.message };
  }
  if (manualCollectionIds.length > 0) {
    const { error: pcInsErr } = await supabase.from("product_collections").insert(
      manualCollectionIds.map((cid) => ({
        product_id: id,
        collection_id: cid,
      })),
    );
    if (pcInsErr) {
      return { id, error: pcInsErr.message };
    }
  }

  const { error: paDelErr } = await supabase
    .from("product_assets")
    .delete()
    .eq("product_id", id);
  if (paDelErr) {
    return { id, error: paDelErr.message };
  }
  const normalizedAssets = assets
    .map((a, i) => ({
      product_id: id,
      url: a.url.trim(),
      kind: a.kind,
      alt_text: a.alt_text.trim(),
      sort_order: a.sort_order ?? i,
    }))
    .filter((a) => a.url !== "");
  if (normalizedAssets.length > 0) {
    const { error: paInsErr } = await supabase
      .from("product_assets")
      .insert(normalizedAssets);
    if (paInsErr) {
      return { id, error: paInsErr.message };
    }
  }

  const { error: optDelErr } = await supabase
    .from("product_option_definitions")
    .delete()
    .eq("product_id", id);
  if (optDelErr) {
    return { id, error: optDelErr.message };
  }
  const defRows = (option_definitions ?? [])
    .map((d, i) => ({
      product_id: id,
      option_key: d.key.trim().slice(0, 200),
      label: (d.label.trim() || d.key.trim()).slice(0, 500),
      presentation: d.presentation,
      sort_order: i,
    }))
    .filter((r) => r.option_key !== "");
  if (defRows.length > 0) {
    const { error: optInsErr } = await supabase
      .from("product_option_definitions")
      .insert(defRows);
    if (optInsErr) {
      return { id, error: optInsErr.message };
    }
  }

  const isNewProduct = productId === null;

  if (isNewProduct) {
    const { error: delErr } = await supabase
      .from("product_variants")
      .delete()
      .eq("product_id", id);
    if (delErr) {
      return { id, error: delErr.message };
    }

    if (variants.length > 0) {
      const { data: inserted, error: insErr } = await supabase
        .from("product_variants")
        .insert(
          variants.map((v) => ({
            product_id: id,
            sku: v.sku.trim(),
            option_values: v.option_values,
            size_id: v.size_id && v.size_id !== "" ? v.size_id : null,
            color_id: v.color_id && v.color_id !== "" ? v.color_id : null,
            price: v.price,
            compare_at_price: v.compare_at_price,
          })),
        )
        .select("id");
      if (insErr || !inserted?.length) {
        return { id, error: insErr?.message ?? "Variant insert failed." };
      }
      const invRows = inserted.map((row, i) => ({
        product_variant_id: (row as { id: string }).id,
        quantity_on_hand: Math.max(0, variants[i]!.quantity_on_hand),
        quantity_reserved: 0,
      }));
      const { error: invErr } = await supabase.from("inventory").insert(invRows);
      if (invErr) {
        return { id, error: invErr.message };
      }
    }
  } else {
    const sync = await syncVariantsForExistingProduct(id, variants);
    if (sync.error) {
      return { id, error: sync.error };
    }
  }

  return { id };
}

export async function deleteProduct(productId: string): Promise<string | undefined> {
  if (!supabase) return ADMIN_MSG_CATALOG_UNAVAILABLE;
  const { error } = await supabase.from("products").delete().eq("id", productId);
  return error?.message;
}

export async function fetchSizes(): Promise<SizeRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("sizes")
    .select("id, name, display_name, size_type, sort_order, is_active")
    .order("sort_order", { ascending: true });
  if (error) {
    logCatalogIssue("fetchSizes", error.message);
    return [];
  }
  return (data ?? []) as SizeRow[];
}

export async function fetchSizeById(id: string): Promise<SizeRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("sizes")
    .select("id, name, display_name, size_type, sort_order, is_active")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    logCatalogIssue("fetchSizeById", error.message);
    return null;
  }
  return data as SizeRow | null;
}

export type SizeWritePayload = {
  name: string;
  display_name: string;
  size_type: "numeric" | "text";
  sort_order: number;
  is_active: boolean;
};

export async function saveSize(
  sizeId: string | null,
  payload: SizeWritePayload,
): Promise<{ id: string; error?: string }> {
  if (!supabase) {
    return { id: "", error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }
  const row = {
    name: payload.name.trim(),
    display_name: payload.display_name.trim(),
    size_type: payload.size_type,
    sort_order: payload.sort_order,
    is_active: payload.is_active,
  };
  if (!sizeId) {
    const { data, error } = await supabase
      .from("sizes")
      .insert(row)
      .select("id")
      .single();
    if (error || !data) {
      return { id: "", error: error?.message ?? "Insert failed." };
    }
    return { id: (data as { id: string }).id };
  }
  const { error } = await supabase.from("sizes").update(row).eq("id", sizeId);
  if (error) {
    return { id: sizeId, error: error.message };
  }
  return { id: sizeId };
}

export async function deleteSizeRow(sizeId: string): Promise<string | undefined> {
  if (!supabase) return ADMIN_MSG_CATALOG_UNAVAILABLE;
  const { error } = await supabase.from("sizes").delete().eq("id", sizeId);
  return error?.message;
}

/** All colors (admin). For pickers, filter `is_active` in UI or use `fetchActiveColors`. */
export async function fetchColors(): Promise<ColorRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("colors")
    .select("id, name, hex, rgb, swatch_image_url, is_active, sort_order")
    .order("sort_order", { ascending: true });
  if (error) {
    logCatalogIssue("fetchColors", error.message);
    return [];
  }
  return (data ?? []) as ColorRow[];
}

export async function fetchActiveColors(): Promise<ColorRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("colors")
    .select("id, name, hex, rgb, swatch_image_url, is_active, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) {
    logCatalogIssue("fetchActiveColors", error.message);
    return [];
  }
  return (data ?? []) as ColorRow[];
}

export async function fetchColorById(id: string): Promise<ColorRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("colors")
    .select("id, name, hex, rgb, swatch_image_url, is_active, sort_order")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    logCatalogIssue("fetchColorById", error.message);
    return null;
  }
  return data as ColorRow | null;
}

export type ColorWritePayload = {
  name: string;
  hex: string | null;
  rgb: string | null;
  swatch_image_url: string;
  is_active: boolean;
  sort_order: number;
};

export async function saveColor(
  colorId: string | null,
  payload: ColorWritePayload,
): Promise<{ id: string; error?: string }> {
  if (!supabase) {
    return { id: "", error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }
  const row = {
    name: payload.name.trim(),
    hex: payload.hex?.trim() || null,
    rgb: payload.rgb?.trim() || null,
    swatch_image_url: payload.swatch_image_url.trim(),
    is_active: payload.is_active,
    sort_order: payload.sort_order,
  };
  if (!row.name) {
    return { id: "", error: "Name is required." };
  }
  if (!colorId) {
    const { data, error } = await supabase
      .from("colors")
      .insert(row)
      .select("id")
      .single();
    if (error || !data) {
      return { id: "", error: error?.message ?? "Insert failed." };
    }
    return { id: (data as { id: string }).id };
  }
  const { error } = await supabase.from("colors").update(row).eq("id", colorId);
  if (error) {
    return { id: colorId, error: error.message };
  }
  return { id: colorId };
}

export async function deleteColorRow(colorId: string): Promise<string | undefined> {
  if (!supabase) return ADMIN_MSG_CATALOG_UNAVAILABLE;
  const { error } = await supabase.from("colors").delete().eq("id", colorId);
  return error?.message;
}

export type TagWritePayload = {
  /** Lowercase slug; unique. */
  name: string;
  /** Display label in admin and optional storefront use. */
  label: string;
};

export async function saveTag(
  tagId: string | null,
  payload: TagWritePayload,
): Promise<{ id: string; error?: string }> {
  if (!supabase) {
    return { id: "", error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }
  const name = payload.name.trim().toLowerCase();
  const label = payload.label.trim();
  if (!name || !label) {
    return { id: "", error: "Name and label are required." };
  }
  const row = {
    name,
    label,
    updated_at: new Date().toISOString(),
  };
  if (!tagId) {
    const { data, error } = await supabase
      .from("tags")
      .insert(row)
      .select("id")
      .single();
    if (error || !data) {
      return { id: "", error: error?.message ?? "Insert failed." };
    }
    return { id: (data as { id: string }).id };
  }
  const { error } = await supabase.from("tags").update(row).eq("id", tagId);
  if (error) {
    return { id: tagId, error: error.message };
  }
  return { id: tagId };
}

export async function deleteTagRow(tagId: string): Promise<string | undefined> {
  if (!supabase) return ADMIN_MSG_CATALOG_UNAVAILABLE;
  const { error } = await supabase.from("tags").delete().eq("id", tagId);
  return error?.message;
}

export type CollectionWritePayload = {
  slug: string;
  name: string;
  description: string;
  hero_image: string;
  sort_order: number;
  collection_type: CollectionTypeDb;
  /** Used when collection_type is tag_based; OR match on storefront. */
  tag_ids: string[];
};

export async function fetchCollectionById(
  id: string,
): Promise<(CollectionRow & { tag_ids: string[] }) | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("collections")
    .select(
      "id, slug, name, description, hero_image, sort_order, collection_type, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    logCatalogIssue("fetchCollectionById", error.message);
    return null;
  }
  if (!data) return null;
  const { data: ctRows } = await supabase
    .from("collection_tags")
    .select("tag_id")
    .eq("collection_id", id);
  const tag_ids = (ctRows ?? []).map((r: { tag_id: string }) => r.tag_id);
  return { ...(data as CollectionRow), tag_ids };
}

export async function saveCollection(
  collectionId: string | null,
  payload: CollectionWritePayload,
): Promise<{ id: string; error?: string }> {
  if (!supabase) {
    return { id: "", error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }
  const { tag_ids, ...collectionFields } = payload;
  const row = {
    ...collectionFields,
    updated_at: new Date().toISOString(),
  };
  let id = collectionId;
  if (!id) {
    const { data, error } = await supabase
      .from("collections")
      .insert(row)
      .select("id")
      .single();
    if (error || !data) {
      return { id: "", error: error?.message ?? "Insert failed." };
    }
    id = (data as { id: string }).id;
  } else {
    const { error } = await supabase.from("collections").update(row).eq("id", id);
    if (error) {
      return { id: id, error: error.message };
    }
  }

  const { error: ctDelErr } = await supabase
    .from("collection_tags")
    .delete()
    .eq("collection_id", id);
  if (ctDelErr) {
    return { id, error: ctDelErr.message };
  }

  if (payload.collection_type === CollectionTypeDb.TagBased) {
    if (tag_ids.length > 0) {
      const { error: ctInsErr } = await supabase.from("collection_tags").insert(
        tag_ids.map((tag_id) => ({
          collection_id: id,
          tag_id,
        })),
      );
      if (ctInsErr) {
        return { id, error: ctInsErr.message };
      }
    }
    const { error: pcClrErr } = await supabase
      .from("product_collections")
      .delete()
      .eq("collection_id", id);
    if (pcClrErr) {
      return { id, error: pcClrErr.message };
    }
  }

  return { id };
}

export async function deleteCollectionRow(
  collectionId: string,
): Promise<string | undefined> {
  if (!supabase) return ADMIN_MSG_CATALOG_UNAVAILABLE;
  const { error } = await supabase
    .from("collections")
    .delete()
    .eq("id", collectionId);
  return error?.message;
}

export type HomePageSectionWithTags = HomePageSectionRow & {
  tags: { id: string; label: string }[];
};

export async function fetchHomePageSections(): Promise<HomePageSectionWithTags[]> {
  if (!supabase) return [];
  const { data: sections, error } = await supabase
    .from("home_page_sections")
    .select("id, name, slug, is_active, sort_order, created_at, updated_at")
    .order("sort_order", { ascending: true });
  if (error) {
    logCatalogIssue("fetchHomePageSections", error.message);
    return [];
  }
  const secList = (sections ?? []) as HomePageSectionRow[];
  if (secList.length === 0) return [];

  const { data: tagLinks } = await supabase
    .from("home_page_section_tags")
    .select("section_id, tag_id, tags(id, label)");

  const tagMap = new Map<string, { id: string; label: string }[]>();
  for (const l of tagLinks ?? []) {
    const item = l as unknown as {
      section_id: string;
      tag_id: string;
      tags: { id: string; label: string } | { id: string; label: string }[] | null;
    };
    if (item.tags) {
      const tagObj = Array.isArray(item.tags) ? item.tags[0] : item.tags;
      if (tagObj) {
        const arr = tagMap.get(item.section_id) || [];
        arr.push({ id: tagObj.id, label: tagObj.label });
        tagMap.set(item.section_id, arr);
      }
    }
  }

  return secList.map((s) => ({
    ...s,
    tags: tagMap.get(s.id) || [],
  }));
}

export async function fetchHomePageSectionById(
  id: string,
): Promise<(HomePageSectionRow & { tag_ids: string[] }) | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("home_page_sections")
    .select("id, name, slug, is_active, sort_order, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    logCatalogIssue("fetchHomePageSectionById", error.message);
    return null;
  }
  if (!data) return null;
  const { data: linkRows } = await supabase
    .from("home_page_section_tags")
    .select("tag_id")
    .eq("section_id", id);
  const tag_ids = (linkRows ?? []).map((r: { tag_id: string }) => r.tag_id);
  return { ...(data as HomePageSectionRow), tag_ids };
}

export type HomePageSectionWritePayload = {
  name: string;
  slug: string;
  is_active: boolean;
  sort_order: number;
  tag_ids: string[];
};

export async function saveHomePageSection(
  sectionId: string | null,
  payload: HomePageSectionWritePayload,
): Promise<{ id: string; error?: string }> {
  if (!supabase) {
    return { id: "", error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }
  const { tag_ids, ...fields } = payload;
  const row = {
    ...fields,
    updated_at: new Date().toISOString(),
  };
  let id = sectionId;
  if (!id) {
    const { data, error } = await supabase
      .from("home_page_sections")
      .insert(row)
      .select("id")
      .single();
    if (error || !data) {
      return { id: "", error: error?.message ?? "Insert failed." };
    }
    id = (data as { id: string }).id;
  } else {
    const { error } = await supabase.from("home_page_sections").update(row).eq("id", id);
    if (error) {
      return { id, error: error.message };
    }
  }

  const { error: delErr } = await supabase
    .from("home_page_section_tags")
    .delete()
    .eq("section_id", id);
  if (delErr) {
    return { id, error: delErr.message };
  }

  if (tag_ids.length > 0) {
    const { error: insErr } = await supabase.from("home_page_section_tags").insert(
      tag_ids.map((tag_id) => ({
        section_id: id,
        tag_id,
      })),
    );
    if (insErr) {
      return { id, error: insErr.message };
    }
  }

  return { id };
}

export async function deleteHomePageSection(
  sectionId: string,
): Promise<string | undefined> {
  if (!supabase) return ADMIN_MSG_CATALOG_UNAVAILABLE;
  const { error } = await supabase.from("home_page_sections").delete().eq("id", sectionId);
  return error?.message;
}

export async function bulkUpdateProductStatusAdmin(
  productIds: string[],
  status: "active" | "draft",
): Promise<{ ok: number; failed: number }> {
  if (!supabase || productIds.length === 0) return { ok: 0, failed: 0 };
  let ok = 0;
  let failed = 0;
  for (const id of productIds) {
    const { error } = await supabase
      .from("products")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) failed += 1;
    else ok += 1;
  }
  const { logAdminAction } = await import("@/lib/audit-log");
  await logAdminAction("bulk_update_status", "products", null, { status, count: ok });
  return { ok, failed };
}

export async function bulkAddTagToProductsAdmin(
  productIds: string[],
  tagId: string,
): Promise<{ ok: number; failed: number }> {
  if (!supabase || productIds.length === 0 || !tagId) return { ok: 0, failed: 0 };
  let ok = 0;
  let failed = 0;
  for (const productId of productIds) {
    const { error } = await supabase
      .from("product_tags")
      .upsert({ product_id: productId, tag_id: tagId }, { onConflict: "product_id,tag_id" });
    if (error) failed += 1;
    else ok += 1;
  }
  const { logAdminAction } = await import("@/lib/audit-log");
  await logAdminAction("bulk_add_tag", "product_tags", tagId, { count: ok });
  return { ok, failed };
}

async function uniqueProductSlug(base: string): Promise<string> {
  if (!supabase) return base;
  let candidate = base;
  let n = 1;
  for (;;) {
    const { data } = await supabase.from("products").select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
    if (n > 50) return `${base}-${Date.now()}`;
  }
}

/** Clone product as draft with new slug/SKUs — variants and gallery copied. */
export async function duplicateProductAdmin(
  sourceId: string,
): Promise<{ id: string; error?: string }> {
  const src = await fetchProductWithVariants(sourceId);
  if (!src) return { id: "", error: "Product not found." };

  const baseSlug = await uniqueProductSlug(`${src.product.slug}-copy`);
  const payload: ProductSavePayload = {
    collection_ids: [...src.collectionIds],
    tag_ids: [...src.tagIds],
    slug: baseSlug,
    name: `${src.product.name} (copy)`,
    short_description: src.product.short_description,
    description: src.product.description,
    status: "draft",
    free_delivery: Boolean(src.product.free_delivery),
    video_url: src.product.video_url ?? null,
    search_keywords_extra: src.product.search_keywords_extra ?? "",
    assets: src.assets.map((a, i) => ({
      url: a.url,
      kind: a.kind,
      alt_text: a.alt_text,
      sort_order: i,
    })),
    rating: null,
    reviews_count: null,
    stock_total: src.product.stock_total ?? 0,
    option_definitions: src.product.option_definitions ?? [],
  };

  const variants: VariantSavePayload[] = src.variants.map((v, i) => ({
    sku: v.sku ? `${v.sku}-C${i + 1}` : `COPY-${i + 1}`,
    option_values: { ...v.option_values },
    size_id: v.size_id,
    color_id: v.color_id,
    price: v.price,
    compare_at_price: v.compare_at_price,
    quantity_on_hand: v.quantity_on_hand,
  }));

  const result = await saveProductAndVariants(null, payload, variants);
  if (result.error) return result;
  const { logAdminAction } = await import("@/lib/audit-log");
  await logAdminAction("duplicate", "products", result.id, { source_id: sourceId });
  return result;
}
