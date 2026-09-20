/** Catalog table row shapes used by the storefront database. */

import type { VariantOptionSchemaEntry } from "@/lib/variant-option-schema";
import { type CollectionTypeDb } from "@/lib/catalog/collection-type";

export type CollectionRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  hero_image: string;
  sort_order: number;
  /** `public.collection_type` enum; omit only before migration. */
  collection_type?: CollectionTypeDb;
};

/** Normalized catalog tag (products and tag-based collections reference by id). */
export type TagRow = {
  id: string;
  name: string;
  label: string;
  created_at: string;
  updated_at: string;
};

/** Homepage product rail (`public.home_page_sections`). */
export type HomePageSectionRow = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** Global size options (XS, S, M, …) for variants. */
export type SizeRow = {
  id: string;
  /** Unique slug-safe key (imports, APIs). */
  name: string;
  /** Shown in pickers and stored in variant option_values.size. */
  display_name: string;
  size_type: "numeric" | "text";
  sort_order: number;
  is_active: boolean;
};

/** Swatch / color options for variants. */
export type ColorRow = {
  id: string;
  name: string;
  hex: string | null;
  rgb: string | null;
  swatch_image_url: string;
  is_active: boolean;
  sort_order: number;
};

/** Gallery row; mirrors public.product_assets. */
export type ProductAssetRow = {
  id: string;
  product_id: string;
  url: string;
  kind: "image" | "video";
  sort_order: number;
  alt_text: string;
};

export type ProductRow = {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  description: string;
  status: "draft" | "active";
  images: unknown;
  tags: string[] | null;
  rating: number | null;
  reviews_count: number | null;
  /** Total units; variant inventory sums to this when using parent-controlled split. */
  stock_total: number | null;
  /** Opt-in: this product's line total is excluded from shipping / threshold basis on checkout. */
  free_delivery?: boolean | null;
  /** Sticky promo / reel URL (YouTube, Facebook, Instagram, or direct MP4). */
  video_url?: string | null;
  /** Denormalized storefront search terms (auto + manual). */
  search_keywords?: string;
  /** Admin manual search extras merged on save. */
  search_keywords_extra?: string;
  /** From `product_option_definitions`; set by `fetchProductWithVariants` only. */
  option_definitions?: VariantOptionSchemaEntry[];
  created_at: string;
  updated_at: string;
};

/** Row from public.product_variants (no stock columns — use inventory) */
export type ProductVariantDbRow = {
  id: string;
  product_id: string;
  sku: string;
  option_values: Record<string, string>;
  price: number;
  compare_at_price: number | null;
  size_id: string | null;
  color_id: string | null;
};

/** Variant + joined inventory for UI */
export type ProductVariantRow = ProductVariantDbRow & {
  quantity_on_hand: number;
  quantity_reserved: number;
};

/** 1:1 with product_variants — stock + reservations */
export type InventoryRow = {
  product_variant_id: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  updated_at: string;
};
