import { revalidateStorefront } from "@/lib/seo/revalidate";

// Keep in sync with storefront `lib/cache/catalog-data.ts` tag strings.

/** Must match `CATALOG_CACHE_TAGS` in the storefront `lib/cache/catalog-data.ts`. */
const TAG_STORE_REVIEW_AGGREGATE = "catalog:store-review-aggregate";
const TAG_PRODUCTS = "catalog:products";

/**
 * Call after admin creates/updates/deletes reviews so the homepage trust strip
 * and product rating aggregates refresh without waiting for ISR TTL.
 */
export function revalidateStorefrontAfterReviewsChange(): void {
  void revalidateStorefront({
    paths: ["/"],
    tags: [TAG_STORE_REVIEW_AGGREGATE, TAG_PRODUCTS],
  });
}
