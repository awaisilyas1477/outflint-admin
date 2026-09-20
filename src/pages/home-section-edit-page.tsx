import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/dashboard/page-header";
import { toast } from "sonner";
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
import {
  deleteHomePageSection,
  fetchHomePageSectionById,
  fetchTags,
  saveHomePageSection,
  type HomePageSectionWritePayload,
} from "@/lib/supabase/catalog";
import type { TagRow } from "@/lib/supabase/catalog-types";
import { slugFromLabel } from "@/lib/slug";
import { supabase } from "@/lib/supabase/client";
import { TagMultiSelect } from "@/components/dashboard/tag-multi-select";
import { SeoFieldsSection } from "@/components/dashboard/seo-fields-section";
import { revalidateStorefront } from "@/lib/seo/revalidate";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function HomeSectionEditPage() {
  const { sectionId } = useParams<{ sectionId: string }>();
  const navigate = useNavigate();
  const isNew = sectionId === "new" || !sectionId;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [slugManual, setSlugManual] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState("0");
  const [catalogTags, setCatalogTags] = useState<TagRow[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!supabase) return;
    void fetchTags().then(setCatalogTags);
  }, []);

  useEffect(() => {
    if (isNew || !sectionId || !supabase) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const row = await fetchHomePageSectionById(sectionId);
      if (cancelled) return;
      if (!row) {
        toast.error("Section not found.");
        setLoading(false);
        return;
      }
      setName(row.name);
      setSlugManual(row.slug);
      setIsActive(row.is_active);
      setSortOrder(String(row.sort_order));
      setSelectedTagIds(new Set(row.tag_ids));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, sectionId]);

  function resolvedSlug(): string {
    const manual = slugManual.trim();
    if (manual) return manual;
    return slugFromLabel(name);
  }

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

    const slug = resolvedSlug();
    if (!slug) {
      toast.error(
        "Use a name with letters or numbers so we can build a URL (e.g. “Featured picks”).",
      );
      return;
    }
    if (!SLUG_PATTERN.test(slug)) {
      toast.error(
        "Slug may only use lowercase letters, numbers, and single hyphens between segments.",
      );
      return;
    }

    const payload: HomePageSectionWritePayload = {
      name: name.trim(),
      slug,
      is_active: isActive,
      sort_order: sort,
      tag_ids: Array.from(selectedTagIds),
    };

    setSaving(true);
    const result = await saveHomePageSection(isNew ? null : sectionId ?? null, payload);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Saved.");
    if (isNew) {
      navigate(`/dashboard/home-sections/${result.id}`, { replace: true });
    } else {
      void revalidateStorefront({ homeSectionSlug: slug });
    }
  }

  async function onDelete() {
    if (isNew || !sectionId || !supabase) return;
    if (!window.confirm("Delete this home section? The storefront home page will stop showing this row.")) {
      return;
    }
    const err = await deleteHomePageSection(sectionId);
    if (err) {
      toast.error(err);
      return;
    }
    navigate("/dashboard/home-sections");
  }

  if (!supabase) {
    return (
      <p className="text-sm text-muted-foreground">{ADMIN_MSG_CATALOG_UNAVAILABLE}</p>
    );
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const previewSlug = resolvedSlug();

  return (
    <div className="space-y-8">
      <PageHeader
        backLink={{ to: "/dashboard/home-sections", label: "Home sections" }}
        title={isNew ? "New home section" : "Edit home section"}
        description="Products appear in this section when they have any of the tags you select (OR logic)."
      />

      <form onSubmit={(e) => void onSubmit(e)} className="mx-auto w-full max-w-4xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>
              The public “View all” link uses <code className="text-[0.8rem]">/s/…</code> so it does not
              clash with collections or product URLs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hs-name">Display name</Label>
              <Input
                id="hs-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="off"
                placeholder="Featured picks"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hs-slug">URL slug (optional)</Label>
              <Input
                id="hs-slug"
                value={slugManual}
                onChange={(e) => setSlugManual(e.target.value)}
                autoComplete="off"
                placeholder="Leave blank to generate from the display name"
              />
              <p className="text-xs text-muted-foreground">
                Storefront URL:{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8rem]">
                  /s/{previewSlug || "…"}
                </code>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={isActive} onCheckedChange={(c) => setIsActive(c === true)} />
                Active on storefront
              </label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hs-sort">Sort order</Label>
              <Input
                id="hs-sort"
                className="max-w-xs"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                required
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hs-tags">Tags</Label>
              <TagMultiSelect
                inputId="hs-tags"
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
                aria-label="Section tags"
              />
              <p className="text-xs text-muted-foreground">
                A product is included if it has at least one of these catalog tags.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {!isNew ? (
            <Button type="button" variant="destructive" onClick={() => void onDelete()}>
              Delete section
            </Button>
          ) : null}
        </div>
      </form>

      {!isNew && sectionId ? (
        <div className="mx-auto w-full max-w-4xl">
          <SeoFieldsSection
            subjectType="home_section"
            subjectId={sectionId}
            revalidate={previewSlug ? { homeSectionSlug: previewSlug } : null}
          />
        </div>
      ) : null}
    </div>
  );
}
