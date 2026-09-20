import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/dashboard/page-header";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ADMIN_MSG_CATALOG_UNAVAILABLE } from "@/lib/admin-user-messages";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  deleteCollectionRow,
  fetchCollectionById,
  fetchTags,
  saveCollection,
  type CollectionWritePayload,
} from "@/lib/supabase/catalog";
import type { TagRow } from "@/lib/supabase/catalog-types";
import { slugFromLabel } from "@/lib/slug";
import { uploadCollectionHeroImage } from "@/lib/supabase/storage";
import { supabase } from "@/lib/supabase/client";
import { TagMultiSelect } from "@/components/dashboard/tag-multi-select";
import { CollectionTypeDb } from "@/lib/catalog/collection-type";
import { SeoFieldsSection } from "@/components/dashboard/seo-fields-section";
import { revalidateStorefront } from "@/lib/seo/revalidate";

export function CollectionEditPage() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const navigate = useNavigate();
  const isNew = collectionId === "new" || !collectionId;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [loadedSlug, setLoadedSlug] = useState<string>("");
  const [description, setDescription] = useState("");
  const [heroImage, setHeroImage] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sortOrder, setSortOrder] = useState("0");
  const [collectionType, setCollectionType] = useState<CollectionTypeDb>(CollectionTypeDb.Manual);
  const [catalogTags, setCatalogTags] = useState<TagRow[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!supabase) return;
    void fetchTags().then(setCatalogTags);
  }, []);

  useEffect(() => {
    if (isNew || !collectionId || !supabase) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const row = await fetchCollectionById(collectionId);
      if (cancelled) return;
      if (!row) {
        toast.error("Collection not found.");
        setLoading(false);
        return;
      }
      setName(row.name);
      setLoadedSlug(row.slug ?? "");
      setDescription(row.description);
      setHeroImage(row.hero_image);
      setSortOrder(String(row.sort_order));
      setCollectionType(row.collection_type ?? CollectionTypeDb.Manual);
      setSelectedTagIds(new Set(row.tag_ids));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, collectionId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) {
      toast.error(ADMIN_MSG_CATALOG_UNAVAILABLE);
      return;
    }

    const sort = Number.parseInt(sortOrder, 10);
    if (Number.isNaN(sort)) {
      toast.error("Sort order must be a whole number.");
      return;
    }

    const slug = slugFromLabel(name);
    if (!slug) {
      toast.error(
        "Use a name with letters or numbers so we can build a URL (e.g. “Summer Tees”).",
      );
      return;
    }

    const payload: CollectionWritePayload = {
      slug,
      name: name.trim(),
      description: description.trim(),
      hero_image: heroImage.trim(),
      sort_order: sort,
      collection_type: collectionType,
      tag_ids:
        collectionType === CollectionTypeDb.TagBased ? Array.from(selectedTagIds) : [],
    };

    setSaving(true);
    const result = await saveCollection(isNew ? null : collectionId ?? null, payload);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Saved.");
    if (isNew) {
      navigate(`/dashboard/collections/${result.id}`, { replace: true });
    } else {
      const slugForRevalidate = loadedSlug || payload.slug;
      if (slugForRevalidate) void revalidateStorefront({ collectionSlug: slugForRevalidate });
    }
  }

  async function onDelete() {
    if (isNew || !collectionId || !supabase) return;
    if (
      !window.confirm(
        "Delete this collection? Products will not be deleted — they are only unlinked from this collection.",
      )
    ) {
      return;
    }
    const err = await deleteCollectionRow(collectionId);
    if (err) {
      toast.error(err);
      return;
    }
    navigate("/dashboard/collections");
  }

  async function onHeroFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingImage(true);
    const res = await uploadCollectionHeroImage(file);
    setUploadingImage(false);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    setHeroImage(res.publicUrl);
    toast.success("Image uploaded — save the collection to keep changes.");
  }

  if (!supabase) {
    return (
      <p className="text-sm text-muted-foreground">{ADMIN_MSG_CATALOG_UNAVAILABLE}</p>
    );
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        backLink={{ to: "/dashboard/collections", label: "Collections" }}
        title={isNew ? "New collection" : "Edit collection"}
        description="Group products for collection pages on the site — optional hero image and sort order."
      />

      <form onSubmit={(e) => void onSubmit(e)} className="mx-auto w-full max-w-4xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>
              The storefront URL is generated automatically from the collection name.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="c-name">Name</Label>
              <Input
                id="c-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="off"
                placeholder="Presser foot collection"
              />
              <p className="text-xs text-muted-foreground">
                Storefront URL:{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8rem]">
                  /collections/{slugFromLabel(name) || "…"}
                </code>
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-sort">Sort order</Label>
              <Input
                id="c-sort"
                className="max-w-xs"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                required
                inputMode="numeric"
              />
            </div>
            <div className="space-y-3 rounded-lg border border-border/80 bg-muted/15 p-4">
              <p className="text-sm font-medium">How products are included</p>
              <RadioGroup
                value={collectionType}
                onValueChange={(v) => setCollectionType(v as CollectionTypeDb)}
                className="gap-4"
              >
                <label
                  htmlFor="c-type-manual"
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-transparent p-2 text-sm transition hover:bg-muted/30 has-data-[state=checked]:border-primary/25 has-data-[state=checked]:bg-primary/4"
                >
                  <RadioGroupItem
                    value={CollectionTypeDb.Manual}
                    id="c-type-manual"
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">Manual</span>
                    <span className="block text-muted-foreground">
                      Choose collections per product on each product&apos;s edit screen. Products appear
                      here when linked.
                    </span>
                  </span>
                </label>
                <label
                  htmlFor="c-type-tag"
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-transparent p-2 text-sm transition hover:bg-muted/30 has-data-[state=checked]:border-primary/25 has-data-[state=checked]:bg-primary/4"
                >
                  <RadioGroupItem
                    value={CollectionTypeDb.TagBased}
                    id="c-type-tag"
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">Tag-based</span>
                    <span className="block text-muted-foreground">
                      Products are included automatically when they match any of the tags you select
                      below (OR logic).
                    </span>
                  </span>
                </label>
              </RadioGroup>
            </div>
            {collectionType === CollectionTypeDb.TagBased ? (
              <div className="space-y-2">
                <Label htmlFor="c-tags">Tags for this collection</Label>
                <TagMultiSelect
                  inputId="c-tags"
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
                  aria-label="Collection tags"
                />
                <p className="text-xs text-muted-foreground">
                  Products will be automatically included based on selected tags. Manual product
                  links for this collection are cleared when you save as tag-based.
                </p>
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                Assign products from each product&apos;s <strong>Collections</strong> checkboxes.
                Tag-based collections are hidden there.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="c-desc">Description</Label>
              <textarea
                id="c-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-hero-file">Hero image</Label>
              <p className="text-xs text-muted-foreground">
                Uploads are stored in your store media library under{" "}
                <code className="text-[0.75rem]">collections/hero/</code>. You can also paste an external image URL below.
              </p>
              <Input
                id="c-hero-file"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                disabled={uploadingImage}
                onChange={(e) => void onHeroFileChange(e)}
                className="cursor-pointer text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm file:font-medium"
              />
              {uploadingImage ? (
                <p className="text-xs text-muted-foreground">Uploading…</p>
              ) : null}
              {heroImage ? (
                <div className="mt-2 overflow-hidden rounded-md border border-border">
                  <img
                    src={heroImage}
                    alt=""
                    className="max-h-44 w-full object-cover"
                  />
                </div>
              ) : null}
              <Label htmlFor="c-hero" className="pt-2">
                Or image URL
              </Label>
              <Input
                id="c-hero"
                value={heroImage}
                onChange={(e) => setHeroImage(e.target.value)}
                placeholder="https://…"
                autoComplete="off"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={saving || uploadingImage}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {!isNew ? (
            <Button type="button" variant="destructive" onClick={() => void onDelete()}>
              Delete collection
            </Button>
          ) : null}
        </div>
      </form>

      {!isNew && collectionId ? (
        <div className="mx-auto w-full max-w-4xl">
          <SeoFieldsSection
            subjectType="collection"
            subjectId={collectionId}
            revalidate={loadedSlug ? { collectionSlug: loadedSlug } : null}
          />
        </div>
      ) : null}
    </div>
  );
}
