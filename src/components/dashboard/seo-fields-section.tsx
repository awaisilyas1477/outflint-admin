/**
 * <SeoFieldsSection /> — reusable per-page SEO override editor.
 *
 * Embedded in product / collection / policy / home-section / tag editors.
 * Has its OWN Save button (independent of the entity's main form) so users
 * can update SEO without touching content fields. Only renders for entities
 * that already have an `id` (i.e. AFTER first save) — for new rows we show a
 * gentle hint until the entity is created.
 *
 * For *route* subjects (e.g. "/", "/contact"), pass `subjectKey` instead of
 * `subjectId` and set `subjectType="route"`.
 */

import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  fetchSeoMetaForRoute,
  fetchSeoMetaForSubject,
  upsertSeoMetaForRoute,
  upsertSeoMetaForSubject,
  type SeoMetaRow,
  type SeoSubjectType,
} from "@/lib/supabase/seo";
import { uploadSeoOgImage } from "@/lib/supabase/storage";
import { revalidateStorefront, type RevalidatePayload } from "@/lib/seo/revalidate";
import {
  formatBytes,
  OG_TARGET_WIDTH,
  OG_TARGET_HEIGHT,
  type ResizeResult,
} from "@/lib/images/resize";
import { ImageCropDialog } from "@/components/dashboard/image-crop-dialog";

const TITLE_RECO_MAX = 60;
const DESC_RECO_MAX = 160;

export type SeoFieldsSectionProps = {
  subjectType: SeoSubjectType;
  /** Required for entity subjects (product/collection/policy_page/home_section/tag). */
  subjectId?: string | null;
  /** Required for `route` / `site_default` subjects (e.g. "/", "/contact"). */
  subjectKey?: string | null;
  locale?: string;
  /**
   * Tells the storefront which paths to revalidate after save. When null,
   * revalidate is skipped (caller can do it themselves elsewhere).
   */
  revalidate?: RevalidatePayload | null;
  /** Heading shown on the card. */
  title?: string;
  /** Description shown on the card. */
  description?: string;
};

const SUBJECT_LABELS: Record<SeoSubjectType, string> = {
  product: "product",
  collection: "collection",
  policy_page: "footer item",
  home_section: "home section",
  tag: "tag",
  route: "route",
  site_default: "site",
};

export function SeoFieldsSection({
  subjectType,
  subjectId,
  subjectKey,
  locale = "en",
  revalidate,
  title = "Search & social (SEO)",
  description,
}: SeoFieldsSectionProps) {
  const tId = useId();
  const dId = useId();
  const cId = useId();
  const ogId = useId();
  const altId = useId();
  const kwId = useId();
  const tcId = useId();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingOgFile, setPendingOgFile] = useState<File | null>(null);

  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [keywordsCsv, setKeywordsCsv] = useState("");
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [ogImageUrl, setOgImageUrl] = useState("");
  const [ogImageAlt, setOgImageAlt] = useState("");
  const [ogImageWidth, setOgImageWidth] = useState<number | null>(null);
  const [ogImageHeight, setOgImageHeight] = useState<number | null>(null);
  const [twitterCard, setTwitterCard] = useState<"summary" | "summary_large_image">(
    "summary_large_image",
  );
  const [noindex, setNoindex] = useState(false);
  const [nofollow, setNofollow] = useState(false);

  const subjectReady = useMemo(() => {
    if (subjectType === "route" || subjectType === "site_default") return Boolean(subjectKey);
    return Boolean(subjectId);
  }, [subjectType, subjectId, subjectKey]);

  // Track latest subject identifier so async loads can't race.
  const lastSubjectKeyRef = useRef<string>("");
  useEffect(() => {
    if (!subjectReady) {
      setLoading(false);
      return;
    }
    const key = `${subjectType}|${subjectId ?? subjectKey ?? ""}|${locale}`;
    lastSubjectKeyRef.current = key;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      let row: SeoMetaRow | null = null;
      if (subjectType === "route" || subjectType === "site_default") {
        row = await fetchSeoMetaForRoute(subjectKey ?? "", locale);
      } else if (subjectId) {
        row = await fetchSeoMetaForSubject(subjectType, subjectId, locale);
      }
      if (cancelled || lastSubjectKeyRef.current !== key) return;
      setSeoTitle(row?.title ?? "");
      setSeoDescription(row?.description ?? "");
      setKeywordsCsv((row?.keywords ?? []).join(", "));
      setCanonicalUrl(row?.canonical_url ?? "");
      setOgImageUrl(row?.og_image_url ?? "");
      setOgImageAlt(row?.og_image_alt ?? "");
      setOgImageWidth(row?.og_image_width ?? null);
      setOgImageHeight(row?.og_image_height ?? null);
      setTwitterCard(row?.twitter_card ?? "summary_large_image");
      setNoindex(Boolean(row?.noindex));
      setNofollow(Boolean(row?.nofollow));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [subjectReady, subjectType, subjectId, subjectKey, locale]);

  function onPickOgImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    // SVGs aren't rasterised — upload as-is, no cropper needed.
    if (file.type === "image/svg+xml") {
      void uploadOgFile(file, null);
      return;
    }
    setPendingOgFile(file);
  }

  async function uploadOgFile(fileToUpload: File, dims: ResizeResult | null) {
    setUploading(true);
    try {
      const res = await uploadSeoOgImage(fileToUpload);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setOgImageUrl(res.publicUrl);
      if (!dims || dims.passedThrough) {
        setOgImageWidth(null);
        setOgImageHeight(null);
        toast.success("Image uploaded — click Save SEO to keep it.");
      } else {
        setOgImageWidth(dims.width);
        setOgImageHeight(dims.height);
        const sizeLabel = `${formatBytes(dims.originalBytes)} → ${formatBytes(dims.bytes)}`;
        if (dims.upscaled) {
          toast.warning(
            `Crop region was smaller than ${dims.width}×${dims.height} so the output was scaled up — preview may look soft. (${sizeLabel})`,
          );
        } else {
          toast.success(
            `Cropped to ${dims.width}×${dims.height} (${sizeLabel}). Click Save SEO to keep it.`,
          );
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload image.");
    } finally {
      setUploading(false);
    }
  }

  async function onSave() {
    if (!subjectReady) return;
    const keywords = keywordsCsv
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 50);
    const patch = {
      title: seoTitle.trim().slice(0, 200),
      description: seoDescription.trim().slice(0, 400),
      keywords,
      canonical_url: canonicalUrl.trim(),
      og_image_url: ogImageUrl.trim(),
      og_image_alt: ogImageAlt.trim().slice(0, 200),
      og_image_width: ogImageUrl.trim() ? ogImageWidth : null,
      og_image_height: ogImageUrl.trim() ? ogImageHeight : null,
      twitter_card: twitterCard,
      noindex,
      nofollow,
    };
    setSaving(true);
    try {
      const res =
        subjectType === "route" || subjectType === "site_default"
          ? await upsertSeoMetaForRoute(subjectKey ?? "", patch, locale)
          : await upsertSeoMetaForSubject(subjectType, subjectId ?? "", patch, locale);
      if (!res.ok) {
        toast.error(res.error ?? "Save failed.");
        return;
      }
      toast.success("SEO saved.");
      if (revalidate) {
        void revalidateStorefront(revalidate);
      }
    } finally {
      setSaving(false);
    }
  }

  const titleLen = seoTitle.length;
  const descLen = seoDescription.length;
  const subjectLabel = SUBJECT_LABELS[subjectType];

  return (
    <Card>
      <ImageCropDialog
        file={pendingOgFile}
        target={{ kind: "og" }}
        title="Crop Open Graph image"
        description={`Drag the image, scroll or pinch to zoom. The framed area will be exported as a ${OG_TARGET_WIDTH}×${OG_TARGET_HEIGHT} JPEG.`}
        onConfirm={async (result) => {
          setPendingOgFile(null);
          await uploadOgFile(result.file, result);
        }}
        onClose={() => setPendingOgFile(null)}
      />
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description ??
            `Per-${subjectLabel} overrides for the search title, snippet, social preview, and indexing rules. Leave empty to inherit defaults.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!subjectReady ? (
          <p className="text-sm text-muted-foreground">
            Save this {subjectLabel} first — SEO overrides are stored against the entity's id.
          </p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Loading SEO…</p>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor={tId}>Title (search & browser tab)</Label>
              <Input
                id={tId}
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                maxLength={200}
                placeholder="Empty uses the entity name"
              />
              <p className="text-xs text-muted-foreground">
                {titleLen} / {TITLE_RECO_MAX} chars recommended.
                {titleLen > TITLE_RECO_MAX ? " Google may truncate at ~60." : ""}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor={dId}>Meta description</Label>
              <textarea
                id={dId}
                rows={3}
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                maxLength={400}
                placeholder="One sentence that summarises this page (shown in search snippets and social previews)."
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              />
              <p className="text-xs text-muted-foreground">
                {descLen} / {DESC_RECO_MAX} chars recommended.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor={cId}>Canonical URL (optional)</Label>
              <Input
                id={cId}
                value={canonicalUrl}
                onChange={(e) => setCanonicalUrl(e.target.value)}
                placeholder="https://your-store.example.com/preferred-path"
                className="font-mono text-sm"
                inputMode="url"
              />
              <p className="text-xs text-muted-foreground">
                Use only if this page should consolidate ranking signals onto a different URL (rare).
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor={kwId}>Keywords (comma-separated, optional)</Label>
              <Input
                id={kwId}
                value={keywordsCsv}
                onChange={(e) => setKeywordsCsv(e.target.value)}
                placeholder="e.g. winter jacket, men, water-resistant"
              />
              <p className="text-xs text-muted-foreground">
                Internal categorisation only — Google ignores meta keywords.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Open Graph / social share image</Label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  id={ogId}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onPickOgImage}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById(ogId)?.click()}
                  disabled={uploading}
                >
                  {uploading ? "Uploading…" : ogImageUrl ? "Replace image" : "Upload image"}
                </Button>
                {ogImageUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setOgImageUrl("")}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              {ogImageUrl ? (
                <div className="mt-2 inline-block overflow-hidden rounded-md border bg-muted/30">
                  <img
                    src={ogImageUrl}
                    alt="Open Graph preview"
                    className="h-32 w-auto object-cover"
                  />
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Pick any image — a cropper opens so you can choose the exact{" "}
                {OG_TARGET_WIDTH}×{OG_TARGET_HEIGHT} region. Output is saved as JPEG.
                {ogImageUrl && ogImageWidth && ogImageHeight
                  ? ` Stored at ${ogImageWidth}×${ogImageHeight}.`
                  : ""}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor={altId}>OG image alt text</Label>
              <Input
                id={altId}
                value={ogImageAlt}
                onChange={(e) => setOgImageAlt(e.target.value)}
                placeholder="Describe the image for accessibility & screen readers"
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={tcId}>Twitter card style</Label>
              <select
                id={tcId}
                value={twitterCard}
                onChange={(e) =>
                  setTwitterCard(e.target.value as "summary" | "summary_large_image")
                }
                className="border-input bg-background flex h-9 w-full max-w-xs rounded-md border px-3 text-sm"
              >
                <option value="summary_large_image">Large image (default)</option>
                <option value="summary">Compact summary</option>
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={noindex}
                  onCheckedChange={(c) => setNoindex(c === true)}
                />
                <span>
                  <span className="block font-medium">No-index this page</span>
                  <span className="block text-xs text-muted-foreground">
                    Hide from Google & Bing search results.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={nofollow}
                  onCheckedChange={(c) => setNofollow(c === true)}
                />
                <span>
                  <span className="block font-medium">No-follow links</span>
                  <span className="block text-xs text-muted-foreground">
                    Tell crawlers not to pass authority through links on this page.
                  </span>
                </span>
              </label>
            </div>

            <div className="flex items-center gap-3">
              <Button type="button" onClick={() => void onSave()} disabled={saving}>
                {saving ? "Saving SEO…" : "Save SEO"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Saves independently of the main form.
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
