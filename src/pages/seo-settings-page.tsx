/**
 * /dashboard/seo
 *
 * Single home for global SEO admin:
 *   - Identity & Address (Organization JSON-LD source)
 *   - Default OG image (fallback for social previews)
 *   - Social profiles (sameAs[] + primary Twitter/Facebook handles)
 *   - Search engine verifications (GSC / Bing / etc.)
 *   - Analytics & pixel IDs
 *   - Per-route SEO overrides for fixed pages (/, /contact, /search…)
 *
 * Each card has its own Save button so admins can update one section without
 * triggering full-page refreshes. After successful saves we ping the storefront
 * `/api/revalidate` so changes appear immediately.
 */

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/lib/supabase/client";
import {
  ADMIN_LIST_PAGE_CLASS,
  ADMIN_LIST_CARD_CLASS,
  ADMIN_LIST_CARD_HEADER_CLASS,
  ADMIN_LIST_CARD_CONTENT_CLASS,
} from "@/components/dashboard/admin-list-shell";
import { cn } from "@/lib/utils";
import {
  fetchSeoAnalytics,
  fetchSeoSite,
  fetchSeoSocialProfiles,
  fetchSeoVerifications,
  insertSeoSocialProfile,
  normalizeSocialUrl,
  updateSeoAnalytics,
  updateSeoSite,
  updateSeoSocialProfile,
  updateSeoVerifications,
  deleteSeoSocialProfile,
  validateSocialProfile,
  type SeoSiteRow,
  type SeoSocialProfileRow,
  type SeoAnalyticsRow,
  type SeoVerificationsRow,
} from "@/lib/supabase/seo";
import { uploadSeoOgImage, uploadSeoLogo } from "@/lib/supabase/storage";
import { revalidateStorefront } from "@/lib/seo/revalidate";
import { SeoFieldsSection } from "@/components/dashboard/seo-fields-section";
import { ImageCropDialog } from "@/components/dashboard/image-crop-dialog";
import {
  formatBytes,
  OG_TARGET_WIDTH,
  OG_TARGET_HEIGHT,
  LOGO_TARGET_SIZE,
  type ResizeResult,
} from "@/lib/images/resize";

const PLATFORM_OPTIONS: { value: string; label: string }[] = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "twitter", label: "Twitter / X (sets twitter:site)" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "pinterest", label: "Pinterest" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "facebook_app", label: "Facebook App ID (sets fb:app_id)" },
];

const ROUTE_OPTIONS: { value: string; label: string }[] = [
  { value: "/", label: "Home page (/)" },
  { value: "/contact", label: "Contact (/contact)" },
  { value: "/collections", label: "All products (/collections)" },
  { value: "/collections/sale", label: "Sale (/collections/sale)" },
  { value: "/bundles", label: "Bundles (/bundles)" },
  { value: "/search", label: "Search results (/search)" },
];

export function SeoSettingsPage() {
  return (
    <div className={ADMIN_LIST_PAGE_CLASS}>
      <PageHeader
        title="SEO settings"
        description="Brand identity, social profiles, verifications, analytics, and per-route overrides. Storefront falls back to defaults when fields are empty."
      />
      {!supabase ? (
        <p className="text-sm text-muted-foreground">
          Connect Supabase to manage SEO settings.
        </p>
      ) : (
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <SiteIdentityCard />
          <DefaultOgImageCard />
          <SocialProfilesCard />
          <VerificationsCard />
          <AnalyticsCard />
          <RouteOverridesCard />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Identity / NAP
// ---------------------------------------------------------------------------

function SiteIdentityCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [row, setRow] = useState<SeoSiteRow | null>(null);
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);

  const legalNameId = useId();
  const phoneId = useId();
  const emailId = useId();
  const streetId = useId();
  const cityId = useId();
  const regionId = useId();
  const postId = useId();
  const countryId = useId();
  const latId = useId();
  const lngId = useId();
  const localeId = useId();

  useEffect(() => {
    let cancelled = false;
    void fetchSeoSite().then((r) => {
      if (!cancelled) {
        setRow(r);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave() {
    if (!row) return;
    setSaving(true);
    const res = await updateSeoSite({
      organization_legal_name: row.organization_legal_name.trim(),
      organization_logo_url: row.organization_logo_url.trim(),
      organization_phone: row.organization_phone.trim(),
      organization_email: row.organization_email.trim(),
      address_street: row.address_street.trim(),
      address_city: row.address_city.trim(),
      address_region: row.address_region.trim(),
      address_postal_code: row.address_postal_code.trim(),
      address_country: row.address_country.trim().toUpperCase() || "PK",
      geo_lat: row.geo_lat,
      geo_lng: row.geo_lng,
      locale: row.locale.trim() || "en_US",
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Save failed.");
      return;
    }
    toast.success("Identity saved.");
    void revalidateStorefront({ all: true });
  }

  function onPickLogo(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !row) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    if (f.type === "image/svg+xml") {
      void uploadLogoFile(f, null);
      return;
    }
    setPendingLogo(f);
  }

  async function uploadLogoFile(fileToUpload: File, dims: ResizeResult | null) {
    if (!row) return;
    setUploading(true);
    try {
      const res = await uploadSeoLogo(fileToUpload);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setRow({ ...row, organization_logo_url: res.publicUrl });
      if (!dims || dims.passedThrough) {
        toast.success("Logo uploaded — click Save to keep it.");
        return;
      }
      const sizeLabel = `${formatBytes(dims.originalBytes)} → ${formatBytes(dims.bytes)}`;
      if (dims.upscaled) {
        toast.warning(
          `Crop region was smaller than ${LOGO_TARGET_SIZE}×${LOGO_TARGET_SIZE} so the output was scaled up — preview may look soft. (${sizeLabel})`,
        );
      } else {
        toast.success(
          `Cropped to ${LOGO_TARGET_SIZE}×${LOGO_TARGET_SIZE} (${sizeLabel}). Click Save to keep it.`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload logo.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className={ADMIN_LIST_CARD_CLASS}>
      <ImageCropDialog
        file={pendingLogo}
        target={{ kind: "logo" }}
        title="Crop logo"
        description={`Drag to reposition, scroll or pinch to zoom. The framed area is exported as a ${LOGO_TARGET_SIZE}×${LOGO_TARGET_SIZE} PNG (transparency preserved).`}
        onConfirm={async (result) => {
          setPendingLogo(null);
          await uploadLogoFile(result.file, result);
        }}
        onClose={() => setPendingLogo(null)}
      />
      <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
        <CardTitle>Identity &amp; address</CardTitle>
        <CardDescription>
          Powers Organization / LocalBusiness JSON-LD and contact details on the storefront.
        </CardDescription>
      </CardHeader>
      <CardContent className={cn(ADMIN_LIST_CARD_CONTENT_CLASS, "space-y-4")}>
        {loading || !row ? (
          <p className="text-sm text-muted-foreground">Loading identity…</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={legalNameId}>Legal organization name</Label>
                <Input
                  id={legalNameId}
                  value={row.organization_legal_name}
                  onChange={(e) =>
                    setRow({ ...row, organization_legal_name: e.target.value })
                  }
                  placeholder="As registered (e.g. SimpleCartStore Pvt. Ltd.)"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={localeId}>Default locale</Label>
                <Input
                  id={localeId}
                  value={row.locale}
                  onChange={(e) => setRow({ ...row, locale: e.target.value })}
                  placeholder="en_US"
                  className="max-w-[160px] font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Organization logo</Label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  id="seo-logo-input"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onPickLogo}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => document.getElementById("seo-logo-input")?.click()}
                >
                  {uploading
                    ? "Uploading…"
                    : row.organization_logo_url
                      ? "Replace logo"
                      : "Upload logo"}
                </Button>
                {row.organization_logo_url ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRow({ ...row, organization_logo_url: "" })}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              {row.organization_logo_url ? (
                <div className="mt-2 inline-block overflow-hidden rounded-md border bg-muted/30">
                  <img
                    src={row.organization_logo_url}
                    alt="Organization logo preview"
                    className="h-20 w-auto object-contain"
                  />
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Pick any image — a cropper opens so you can choose the exact{" "}
                {LOGO_TARGET_SIZE}×{LOGO_TARGET_SIZE} square. Output is saved as PNG (transparency
                preserved). SVG uploads are kept as-is. Used in Organization JSON-LD and Google
                knowledge panels.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={phoneId}>Public phone (E.164 if possible)</Label>
                <Input
                  id={phoneId}
                  value={row.organization_phone}
                  onChange={(e) => setRow({ ...row, organization_phone: e.target.value })}
                  placeholder="+923001234567"
                  inputMode="tel"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={emailId}>Public email</Label>
                <Input
                  id={emailId}
                  type="email"
                  value={row.organization_email}
                  onChange={(e) => setRow({ ...row, organization_email: e.target.value })}
                  placeholder="hello@your-store.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={streetId}>Street</Label>
              <Input
                id={streetId}
                value={row.address_street}
                onChange={(e) => setRow({ ...row, address_street: e.target.value })}
                placeholder="123 Main Street"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={cityId}>City</Label>
                <Input
                  id={cityId}
                  value={row.address_city}
                  onChange={(e) => setRow({ ...row, address_city: e.target.value })}
                  placeholder="Lahore"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={regionId}>Region / state</Label>
                <Input
                  id={regionId}
                  value={row.address_region}
                  onChange={(e) => setRow({ ...row, address_region: e.target.value })}
                  placeholder="Punjab"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={postId}>Postal code</Label>
                <Input
                  id={postId}
                  value={row.address_postal_code}
                  onChange={(e) => setRow({ ...row, address_postal_code: e.target.value })}
                  placeholder="54000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={countryId}>Country (ISO 3166-1 alpha-2)</Label>
                <Input
                  id={countryId}
                  value={row.address_country}
                  onChange={(e) =>
                    setRow({ ...row, address_country: e.target.value.toUpperCase() })
                  }
                  placeholder="PK"
                  maxLength={2}
                  className="max-w-[120px] font-mono uppercase"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={latId}>Latitude</Label>
                <Input
                  id={latId}
                  value={row.geo_lat ?? ""}
                  onChange={(e) =>
                    setRow({
                      ...row,
                      geo_lat: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  placeholder="31.5204"
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={lngId}>Longitude</Label>
                <Input
                  id={lngId}
                  value={row.geo_lng ?? ""}
                  onChange={(e) =>
                    setRow({
                      ...row,
                      geo_lng: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  placeholder="74.3587"
                  inputMode="decimal"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="button" onClick={() => void onSave()} disabled={saving}>
                {saving ? "Saving…" : "Save identity"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Default OG image (separate card so it's the most visible action)
// ---------------------------------------------------------------------------

function DefaultOgImageCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const altId = useId();

  useEffect(() => {
    let cancelled = false;
    void fetchSeoSite().then((r) => {
      if (cancelled) return;
      setUrl(r.default_og_image_url ?? "");
      setAlt(r.default_og_image_alt ?? "");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    if (f.type === "image/svg+xml") {
      void uploadOgFile(f, null);
      return;
    }
    setPendingFile(f);
  }

  async function uploadOgFile(fileToUpload: File, dims: ResizeResult | null) {
    setUploading(true);
    try {
      const res = await uploadSeoOgImage(fileToUpload);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setUrl(res.publicUrl);
      if (!dims || dims.passedThrough) {
        toast.success("Image uploaded — click Save to keep it.");
        return;
      }
      const sizeLabel = `${formatBytes(dims.originalBytes)} → ${formatBytes(dims.bytes)}`;
      if (dims.upscaled) {
        toast.warning(
          `Crop region was smaller than ${OG_TARGET_WIDTH}×${OG_TARGET_HEIGHT} so the output was scaled up — preview may look soft. (${sizeLabel})`,
        );
      } else {
        toast.success(
          `Cropped to ${OG_TARGET_WIDTH}×${OG_TARGET_HEIGHT} (${sizeLabel}). Click Save to keep it.`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload image.");
    } finally {
      setUploading(false);
    }
  }

  async function onSave() {
    setSaving(true);
    const res = await updateSeoSite({
      default_og_image_url: url.trim(),
      default_og_image_alt: alt.trim(),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Save failed.");
      return;
    }
    toast.success("Default OG image saved.");
    void revalidateStorefront({ all: true });
  }

  return (
    <Card className={ADMIN_LIST_CARD_CLASS}>
      <ImageCropDialog
        file={pendingFile}
        target={{ kind: "og" }}
        title="Crop default Open Graph image"
        description={`Drag to reposition, scroll or pinch to zoom. The framed area is exported as a ${OG_TARGET_WIDTH}×${OG_TARGET_HEIGHT} JPEG.`}
        onConfirm={async (result) => {
          setPendingFile(null);
          await uploadOgFile(result.file, result);
        }}
        onClose={() => setPendingFile(null)}
      />
      <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
        <CardTitle>Default Open Graph image</CardTitle>
        <CardDescription>
          Fallback social-preview image used when a page has no override and no first asset. A
          cropper opens after you pick a file so you can choose the exact{" "}
          {OG_TARGET_WIDTH}×{OG_TARGET_HEIGHT} region; output is saved as JPEG.
        </CardDescription>
      </CardHeader>
      <CardContent className={cn(ADMIN_LIST_CARD_CONTENT_CLASS, "space-y-4")}>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <input
                id="seo-og-default-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPick}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => document.getElementById("seo-og-default-input")?.click()}
              >
                {uploading ? "Uploading…" : url ? "Replace image" : "Upload image"}
              </Button>
              {url ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setUrl("")}>
                  Remove
                </Button>
              ) : null}
            </div>
            {url ? (
              <div className="overflow-hidden rounded-md border bg-muted/30 inline-block">
                <img
                  src={url}
                  alt="Default OG preview"
                  className="h-40 w-auto object-cover"
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No default image set yet.</p>
            )}
            <div className="space-y-2">
              <Label htmlFor={altId}>Alt text</Label>
              <Input
                id={altId}
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                placeholder="Describe the image for accessibility"
                maxLength={200}
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button type="button" onClick={() => void onSave()} disabled={saving}>
                {saving ? "Saving…" : "Save default OG"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Social profiles (variable list)
// ---------------------------------------------------------------------------

/**
 * IDs that start with this prefix are unsaved drafts created locally — they
 * never hit Postgres until the admin clicks Save, which means clicking
 * "Add profile" no longer triggers a check-constraint violation on the empty
 * URL row.
 */
const DRAFT_ID_PREFIX = "draft-";
const isDraft = (id: string) => id.startsWith(DRAFT_ID_PREFIX);

function SocialProfilesCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<SeoSocialProfileRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const dirty = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void fetchSeoSocialProfiles().then((r) => {
      if (!cancelled) {
        setRows(r);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function update(id: string, patch: Partial<SeoSocialProfileRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    dirty.current.add(id);
    // Clear any stale validation message on edit so the UI feels responsive.
    setErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function onUrlBlur(id: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, url: normalizeSocialUrl(r.url, r.platform) } : r)),
    );
  }

  function onAdd() {
    const draftId = `${DRAFT_ID_PREFIX}${
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    }`;
    const newRow: SeoSocialProfileRow = {
      id: draftId,
      platform: "facebook",
      url: "",
      handle: "",
      is_primary: false,
      sort_order: rows.length,
      is_active: true,
    };
    setRows((prev) => [...prev, newRow]);
    dirty.current.add(draftId);
  }

  async function onRemove(id: string) {
    // Drafts only live in local state — drop them without hitting the server.
    if (isDraft(id)) {
      dirty.current.delete(id);
      setErrors((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setRows((prev) => prev.filter((r) => r.id !== id));
      return;
    }
    if (!window.confirm("Remove this social profile?")) return;
    const res = await deleteSeoSocialProfile(id);
    if (!res.ok) {
      toast.error(res.error ?? "Delete failed.");
      return;
    }
    dirty.current.delete(id);
    setRows((prev) => prev.filter((r) => r.id !== id));
    void revalidateStorefront({ all: true });
  }

  async function onSave() {
    // Pre-flight validation across every dirty row so we never partially save.
    const ids = Array.from(dirty.current);
    const next: Record<string, string> = {};
    const normalized: Record<string, SeoSocialProfileRow> = {};
    for (const id of ids) {
      const r = rows.find((x) => x.id === id);
      if (!r) continue;
      const url = normalizeSocialUrl(r.url, r.platform);
      const handle = r.handle.trim();
      const reason = validateSocialProfile({ platform: r.platform, url });
      if (reason) next[id] = reason;
      normalized[id] = { ...r, url, handle };
    }
    if (Object.keys(next).length > 0) {
      setErrors(next);
      // Reflect normalized values (e.g. auto-https) so the user sees what we'll send.
      setRows((prev) => prev.map((r) => normalized[r.id] ?? r));
      toast.error("Fix the highlighted fields before saving.");
      return;
    }

    setSaving(true);
    try {
      for (const id of ids) {
        const r = normalized[id];
        if (!r) continue;
        if (isDraft(id)) {
          const res = await insertSeoSocialProfile({
            platform: r.platform,
            url: r.url,
            handle: r.handle,
            is_primary: r.is_primary,
            sort_order: r.sort_order,
            is_active: r.is_active,
          });
          if (!res.ok || !res.id) {
            setErrors((prev) => ({ ...prev, [id]: res.error ?? "Insert failed." }));
            toast.error(`${r.platform}: ${res.error ?? "insert failed"}.`);
            return;
          }
          const newId = res.id;
          setRows((prev) =>
            prev.map((row) => (row.id === id ? { ...row, id: newId, url: r.url, handle: r.handle } : row)),
          );
          dirty.current.delete(id);
        } else {
          const res = await updateSeoSocialProfile(id, {
            platform: r.platform,
            url: r.url,
            handle: r.handle,
            is_primary: r.is_primary,
            sort_order: r.sort_order,
            is_active: r.is_active,
          });
          if (!res.ok) {
            setErrors((prev) => ({ ...prev, [id]: res.error ?? "Save failed." }));
            toast.error(`${r.platform || id}: ${res.error ?? "save failed"}.`);
            return;
          }
          dirty.current.delete(id);
        }
      }
      setErrors({});
      toast.success("Social profiles saved.");
      void revalidateStorefront({ all: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={ADMIN_LIST_CARD_CLASS}>
      <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
        <CardTitle>Social profiles</CardTitle>
        <CardDescription>
          Listed as <code>sameAs</code> in Organization JSON-LD. Mark Twitter/Facebook as
          primary to set the corresponding meta tags.
        </CardDescription>
      </CardHeader>
      <CardContent className={cn(ADMIN_LIST_CARD_CONTENT_CLASS, "space-y-4")}>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No social profiles yet.</p>
            ) : (
              <ul className="space-y-3">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className="grid gap-3 rounded-md border p-3 sm:grid-cols-[180px_1fr_1fr_auto]"
                  >
                    <div className="space-y-1">
                      <Label className="text-xs">Platform</Label>
                      <select
                        value={r.platform}
                        onChange={(e) => update(r.id, { platform: e.target.value })}
                        className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm"
                      >
                        {PLATFORM_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">
                        {r.platform === "facebook_app" ? "App ID" : "URL"}
                      </Label>
                      <Input
                        value={r.url}
                        onChange={(e) => update(r.id, { url: e.target.value })}
                        onBlur={() => onUrlBlur(r.id)}
                        aria-invalid={Boolean(errors[r.id])}
                        placeholder={
                          r.platform === "facebook_app"
                            ? "1234567890"
                            : "https://example.com/your-handle"
                        }
                      />
                      {errors[r.id] ? (
                        <p className="text-destructive text-xs">{errors[r.id]}</p>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Handle (optional)</Label>
                      <Input
                        value={r.handle}
                        onChange={(e) => update(r.id, { handle: e.target.value })}
                        placeholder={
                          r.platform === "twitter" ? "@yourhandle" : "yourhandle"
                        }
                      />
                    </div>
                    <div className="flex flex-col items-start gap-2 self-end">
                      <label className="flex cursor-pointer items-center gap-2 text-xs">
                        <Checkbox
                          checked={r.is_primary}
                          onCheckedChange={(c) => update(r.id, { is_primary: c === true })}
                        />
                        Primary
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void onRemove(r.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={() => void onAdd()}>
                Add profile
              </Button>
              <Button type="button" onClick={() => void onSave()} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Search engine verifications
// ---------------------------------------------------------------------------

function VerificationsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<SeoVerificationsRow | null>(null);

  const gscId = useId();
  const bingId = useId();
  const fbId = useId();
  const pinId = useId();
  const yaId = useId();

  useEffect(() => {
    let cancelled = false;
    void fetchSeoVerifications().then((r) => {
      if (!cancelled) {
        setRow(r);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave() {
    if (!row) return;
    setSaving(true);
    const res = await updateSeoVerifications({
      google_site_verification: row.google_site_verification.trim(),
      bing_site_verification: row.bing_site_verification.trim(),
      facebook_domain_verification: row.facebook_domain_verification.trim(),
      pinterest_site_verification: row.pinterest_site_verification.trim(),
      yandex_site_verification: row.yandex_site_verification.trim(),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Save failed.");
      return;
    }
    toast.success("Verifications saved.");
    void revalidateStorefront({ all: true });
  }

  return (
    <Card className={ADMIN_LIST_CARD_CLASS}>
      <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
        <CardTitle>Search engine &amp; domain verifications</CardTitle>
        <CardDescription>
          Paste only the meta tag content value (the part after <code>content=</code>).
        </CardDescription>
      </CardHeader>
      <CardContent className={cn(ADMIN_LIST_CARD_CONTENT_CLASS, "space-y-4")}>
        {loading || !row ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor={gscId}>Google Search Console</Label>
              <Input
                id={gscId}
                value={row.google_site_verification}
                onChange={(e) =>
                  setRow({ ...row, google_site_verification: e.target.value })
                }
                placeholder="abcdef…"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={bingId}>Bing Webmaster</Label>
              <Input
                id={bingId}
                value={row.bing_site_verification}
                onChange={(e) =>
                  setRow({ ...row, bing_site_verification: e.target.value })
                }
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={fbId}>Facebook domain verification</Label>
              <Input
                id={fbId}
                value={row.facebook_domain_verification}
                onChange={(e) =>
                  setRow({ ...row, facebook_domain_verification: e.target.value })
                }
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={pinId}>Pinterest verification</Label>
              <Input
                id={pinId}
                value={row.pinterest_site_verification}
                onChange={(e) =>
                  setRow({ ...row, pinterest_site_verification: e.target.value })
                }
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={yaId}>Yandex verification</Label>
              <Input
                id={yaId}
                value={row.yandex_site_verification}
                onChange={(e) =>
                  setRow({ ...row, yandex_site_verification: e.target.value })
                }
                className="font-mono text-sm"
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button type="button" onClick={() => void onSave()} disabled={saving}>
                {saving ? "Saving…" : "Save verifications"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Analytics & pixels
// ---------------------------------------------------------------------------

function AnalyticsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<SeoAnalyticsRow | null>(null);

  const gaId = useId();
  const gtmId = useId();
  const metaId = useId();
  const tikId = useId();

  useEffect(() => {
    let cancelled = false;
    void fetchSeoAnalytics().then((r) => {
      if (!cancelled) {
        setRow(r);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave() {
    if (!row) return;
    setSaving(true);
    const res = await updateSeoAnalytics({
      google_analytics_id: row.google_analytics_id.trim(),
      google_tag_manager_id: row.google_tag_manager_id.trim(),
      meta_pixel_id: row.meta_pixel_id.trim(),
      tiktok_pixel_id: row.tiktok_pixel_id.trim(),
      consent_required: row.consent_required,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Save failed.");
      return;
    }
    toast.success("Analytics saved.");
    void revalidateStorefront({ all: true });
  }

  return (
    <Card className={ADMIN_LIST_CARD_CLASS}>
      <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
        <CardTitle>Analytics &amp; pixels</CardTitle>
        <CardDescription>
          Storefront loads these from the database. GA4 (G-XXXX) can run alongside GTM—if the
          same GA4 property is also configured inside GTM, remove one side to avoid double
          page_view counts. When GTM is set, Meta/TikTok should be managed inside GTM (direct
          pixel fields are skipped). Use “Require consent” for markets with cookie laws.
        </CardDescription>
      </CardHeader>
      <CardContent className={cn(ADMIN_LIST_CARD_CONTENT_CLASS, "space-y-4")}>
        {loading || !row ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={gaId}>Google Analytics 4 (G-XXXX)</Label>
                <Input
                  id={gaId}
                  value={row.google_analytics_id}
                  onChange={(e) => setRow({ ...row, google_analytics_id: e.target.value })}
                  className="font-mono text-sm"
                  placeholder="G-XXXXXXX"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={gtmId}>Google Tag Manager (GTM-XXXX)</Label>
                <Input
                  id={gtmId}
                  value={row.google_tag_manager_id}
                  onChange={(e) =>
                    setRow({ ...row, google_tag_manager_id: e.target.value })
                  }
                  className="font-mono text-sm"
                  placeholder="GTM-XXXXXXX"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={metaId}>Meta Pixel ID</Label>
                <Input
                  id={metaId}
                  value={row.meta_pixel_id}
                  onChange={(e) => setRow({ ...row, meta_pixel_id: e.target.value })}
                  className="font-mono text-sm"
                  placeholder="123456789012345"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={tikId}>TikTok Pixel ID</Label>
                <Input
                  id={tikId}
                  value={row.tiktok_pixel_id}
                  onChange={(e) => setRow({ ...row, tiktok_pixel_id: e.target.value })}
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={row.consent_required}
                onCheckedChange={(c) => setRow({ ...row, consent_required: c === true })}
              />
              <span>
                <span className="block font-medium">Require consent before firing scripts</span>
                <span className="block text-xs text-muted-foreground">
                  Storefront waits for cookie consent before loading analytics.
                </span>
              </span>
            </label>
            <div className="flex items-center gap-3 pt-2">
              <Button type="button" onClick={() => void onSave()} disabled={saving}>
                {saving ? "Saving…" : "Save analytics"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Per-route SEO overrides (home, contact, sale, etc.)
// ---------------------------------------------------------------------------

function RouteOverridesCard() {
  const [route, setRoute] = useState<string>(ROUTE_OPTIONS[0].value);

  const subjectKey = route === "/" ? "/" : route;
  const revalidate =
    route === "/" ? { all: true } : { paths: [route] };

  return (
    <Card className={ADMIN_LIST_CARD_CLASS}>
      <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
        <CardTitle>Per-page overrides for fixed routes</CardTitle>
        <CardDescription>
          Customise SEO for static pages. Product, collection, and footer pages are edited from
          their respective dashboards.
        </CardDescription>
      </CardHeader>
      <CardContent className={cn(ADMIN_LIST_CARD_CONTENT_CLASS, "space-y-4")}>
        <div className="space-y-2">
          <Label>Page</Label>
          <select
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            className="border-input bg-background flex h-9 w-full max-w-md rounded-md border px-3 text-sm"
          >
            {ROUTE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <SeoFieldsSection
          key={subjectKey}
          subjectType="route"
          subjectKey={subjectKey}
          revalidate={revalidate}
          title={`SEO overrides — ${ROUTE_OPTIONS.find((r) => r.value === route)?.label}`}
          description="Leave fields empty to inherit defaults from the page-level fallback."
        />
      </CardContent>
    </Card>
  );
}
