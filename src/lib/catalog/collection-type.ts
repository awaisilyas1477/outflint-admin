/**
 * Mirrors `public.collection_type` enum in Postgres
 * (`e-commerece-website/supabase/migrations/…_tags_and_tag_based_collections.sql`).
 * Keep values in sync with the database.
 */
export const CollectionTypeDb = {
  Manual: "manual",
  TagBased: "tag_based",
} as const;

export type CollectionTypeDb = (typeof CollectionTypeDb)[keyof typeof CollectionTypeDb];

export function collectionIsTagBased(
  value: string | null | undefined,
): boolean {
  return (value ?? CollectionTypeDb.Manual) === CollectionTypeDb.TagBased;
}
