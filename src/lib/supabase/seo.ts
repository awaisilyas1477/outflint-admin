/**
 * Admin-side reads/writes for the SEO foundation tables.
 *
 *   public.seo_site                          → identity, NAP, default OG, locale (singleton)
 *   public.seo_social_profiles               → variable list (sameAs + primary handles)
 *   public.seo_search_engine_verifications   → ownership meta tags (singleton)
 *   public.seo_analytics                     → analytics & pixel IDs (singleton)
 *   public.seo_meta                          → per-page overrides
 *   public.product_shopping_attributes       → 1:1 SEO/Shopping fields
 */

import { supabase } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SeoSubjectType =
  | "product"
  | "collection"
  | "policy_page"
  | "home_section"
  | "tag"
  | "route"
  | "site_default";

export type SeoMetaRow = {
  id: string;
  subject_type: SeoSubjectType;
  subject_id: string | null;
  subject_key: string | null;
  locale: string;
  title: string;
  description: string;
  keywords: string[];
  canonical_url: string;
  og_image_url: string;
  og_image_alt: string;
  og_image_width: number | null;
  og_image_height: number | null;
  twitter_card: "summary" | "summary_large_image";
  noindex: boolean;
  nofollow: boolean;
  json_ld_overrides: Record<string, unknown>;
};

export type SeoMetaWritable = Omit<SeoMetaRow, "id">;

export type SeoSiteRow = {
  organization_legal_name: string;
  organization_logo_url: string;
  organization_phone: string;
  organization_email: string;
  address_street: string;
  address_city: string;
  address_region: string;
  address_postal_code: string;
  address_country: string;
  geo_lat: number | null;
  geo_lng: number | null;
  default_og_image_url: string;
  default_og_image_alt: string;
  locale: string;
};

export type SeoSocialProfileRow = {
  id: string;
  platform: string;
  url: string;
  handle: string;
  is_primary: boolean;
  sort_order: number;
  is_active: boolean;
};

export type SeoSocialProfileWritable = Omit<SeoSocialProfileRow, "id">;

export type SeoVerificationsRow = {
  google_site_verification: string;
  bing_site_verification: string;
  facebook_domain_verification: string;
  pinterest_site_verification: string;
  yandex_site_verification: string;
};

export type SeoAnalyticsRow = {
  google_analytics_id: string;
  google_tag_manager_id: string;
  meta_pixel_id: string;
  tiktok_pixel_id: string;
  consent_required: boolean;
};

export type ProductShoppingRow = {
  product_id: string;
  brand_name: string;
  gtin: string;
  mpn: string;
  country_of_origin: string;
  material: string;
  return_policy_id: string | null;
  shipping_policy_id: string | null;
  is_original_imagery: boolean;
};

// ---------------------------------------------------------------------------
// seo_meta — per page overrides
// ---------------------------------------------------------------------------

const SEO_META_COLS =
  "id, subject_type, subject_id, subject_key, locale, title, description, keywords, canonical_url, og_image_url, og_image_alt, og_image_width, og_image_height, twitter_card, noindex, nofollow, json_ld_overrides";

/** Load one override by entity (subject_id) — returns null when none exists yet. */
export async function fetchSeoMetaForSubject(
  subjectType: SeoSubjectType,
  subjectId: string,
  locale = "en",
): Promise<SeoMetaRow | null> {
  if (!supabase || !subjectId) return null;
  const { data, error } = await supabase
    .from("seo_meta")
    .select(SEO_META_COLS)
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .eq("locale", locale)
    .maybeSingle();
  if (error) {
    console.error("[seo] fetchSeoMetaForSubject", error.message);
    return null;
  }
  return (data as SeoMetaRow | null) ?? null;
}

/** Load one override by route key (e.g. '/', '/contact'). */
export async function fetchSeoMetaForRoute(
  subjectKey: string,
  locale = "en",
): Promise<SeoMetaRow | null> {
  if (!supabase || !subjectKey) return null;
  const { data, error } = await supabase
    .from("seo_meta")
    .select(SEO_META_COLS)
    .eq("subject_type", "route")
    .eq("subject_key", subjectKey)
    .eq("locale", locale)
    .maybeSingle();
  if (error) {
    console.error("[seo] fetchSeoMetaForRoute", error.message);
    return null;
  }
  return (data as SeoMetaRow | null) ?? null;
}

/** Insert or update an override for an entity (subject_id). */
export async function upsertSeoMetaForSubject(
  subjectType: SeoSubjectType,
  subjectId: string,
  patch: Partial<SeoMetaWritable>,
  locale = "en",
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  if (!subjectId) return { ok: false, error: "Save the entity first." };
  const payload = {
    subject_type: subjectType,
    subject_id: subjectId,
    subject_key: null,
    locale,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("seo_meta")
    .upsert(payload, { onConflict: "subject_type,subject_id,locale" })
    .select("id");
  if (error) {
    console.error("[seo] upsertSeoMetaForSubject", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Insert or update an override for a route (subject_key). */
export async function upsertSeoMetaForRoute(
  subjectKey: string,
  patch: Partial<SeoMetaWritable>,
  locale = "en",
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  if (!subjectKey) return { ok: false, error: "Route key is required." };
  const payload = {
    subject_type: "route" as const,
    subject_id: null,
    subject_key: subjectKey,
    locale,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("seo_meta")
    .upsert(payload, { onConflict: "subject_type,subject_key,locale" })
    .select("id");
  if (error) {
    console.error("[seo] upsertSeoMetaForRoute", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function deleteSeoMetaForSubject(
  subjectType: SeoSubjectType,
  subjectId: string,
  locale = "en",
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { error } = await supabase
    .from("seo_meta")
    .delete()
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .eq("locale", locale);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// seo_site — singleton
// ---------------------------------------------------------------------------

const SEO_SITE_COLS =
  "organization_legal_name, organization_logo_url, organization_phone, organization_email, address_street, address_city, address_region, address_postal_code, address_country, geo_lat, geo_lng, default_og_image_url, default_og_image_alt, locale";

const EMPTY_SITE: SeoSiteRow = {
  organization_legal_name: "",
  organization_logo_url: "",
  organization_phone: "",
  organization_email: "",
  address_street: "",
  address_city: "",
  address_region: "",
  address_postal_code: "",
  address_country: "PK",
  geo_lat: null,
  geo_lng: null,
  default_og_image_url: "",
  default_og_image_alt: "",
  locale: "en_US",
};

export async function fetchSeoSite(): Promise<SeoSiteRow> {
  if (!supabase) return EMPTY_SITE;
  const { data, error } = await supabase
    .from("seo_site")
    .select(SEO_SITE_COLS)
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    console.error("[seo] fetchSeoSite", error.message);
    return EMPTY_SITE;
  }
  return (data as SeoSiteRow | null) ?? EMPTY_SITE;
}

export async function updateSeoSite(
  patch: Partial<SeoSiteRow>,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { data, error } = await supabase
    .from("seo_site")
    .upsert({ id: 1, ...patch, updated_at: new Date().toISOString() }, { onConflict: "id" })
    .select("id");
  if (error) {
    console.error("[seo] updateSeoSite", error.message);
    return { ok: false, error: error.message };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error:
        "Nothing was saved — your account is not an active admin or the SEO migration hasn't been applied.",
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// seo_social_profiles — collection editor (variable rows)
// ---------------------------------------------------------------------------

/**
 * Mirror of the Postgres check constraint
 * `seo_social_url_format` — every row except `facebook_app` must store a full
 * `http(s)://` URL. Validating client-side stops the round-trip and lets us
 * surface a precise field-level error instead of the raw constraint name.
 */
const SOCIAL_URL_RE = /^https?:\/\/\S+/i;

/**
 * Best-effort normalization for paste-ins like `facebook.com/simplecartstore` or
 * `www.x.com/simplecartstore`. Returns the original string when no scheme is missing
 * (so `facebook_app` numeric IDs and already-valid URLs pass through unchanged).
 */
export function normalizeSocialUrl(input: string, platform: string): string {
  const t = (input ?? "").trim();
  if (!t) return "";
  if (platform === "facebook_app") return t;
  if (SOCIAL_URL_RE.test(t)) return t;
  // Treat `domain.tld/...` and `www.domain.tld/...` as URLs that just lost their scheme.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(t) || /^www\./i.test(t)) {
    return `https://${t.replace(/^\/+/, "")}`;
  }
  return t;
}

/**
 * Returns null when the row would satisfy the Postgres check constraint, or a
 * human-readable reason otherwise. Callers should validate before any
 * insert/update so admins never see "violates check constraint" toasts.
 */
export function validateSocialProfile(row: {
  platform: string;
  url: string;
}): string | null {
  const platform = (row.platform ?? "").trim();
  const url = (row.url ?? "").trim();
  if (!platform) return "Pick a platform.";
  if (!url) {
    return platform === "facebook_app"
      ? "Enter the numeric Facebook App ID."
      : "Enter the full profile URL (must start with https://).";
  }
  if (platform === "facebook_app") {
    if (!/^\d+$/.test(url)) return "Facebook App ID must be numeric (digits only).";
    return null;
  }
  if (!SOCIAL_URL_RE.test(url)) {
    return "URL must start with http:// or https://";
  }
  return null;
}

/**
 * Map common Postgres error shapes to plain English for toast messages. We
 * detect by `code` first (most reliable) and fall back to the message string
 * for environments where PostgREST strips the code.
 */
function humanizeSocialProfileError(error: { code?: string; message?: string } | null): string {
  if (!error) return "Save failed.";
  const msg = (error.message ?? "").toLowerCase();
  if (
    error.code === "23514" ||
    msg.includes("seo_social_url_format") ||
    msg.includes("check constraint")
  ) {
    return "Profile URL must start with https:// (or be a numeric Facebook App ID for the App row).";
  }
  if (error.code === "23505" || msg.includes("duplicate")) {
    return "Only one row per platform can be marked Primary.";
  }
  return error.message ?? "Save failed.";
}

export async function fetchSeoSocialProfiles(): Promise<SeoSocialProfileRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("seo_social_profiles")
    .select("id, platform, url, handle, is_primary, sort_order, is_active")
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("[seo] fetchSeoSocialProfiles", error.message);
    return [];
  }
  return (data as SeoSocialProfileRow[]) ?? [];
}

export async function insertSeoSocialProfile(
  row: SeoSocialProfileWritable,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const reason = validateSocialProfile(row);
  if (reason) return { ok: false, error: reason };
  const { data, error } = await supabase
    .from("seo_social_profiles")
    .insert(row)
    .select("id")
    .single();
  if (error) return { ok: false, error: humanizeSocialProfileError(error) };
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateSeoSocialProfile(
  id: string,
  patch: Partial<SeoSocialProfileWritable>,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  // Validate when the patch includes both fields the constraint cares about.
  if (patch.platform !== undefined || patch.url !== undefined) {
    const platform = patch.platform ?? "";
    const url = patch.url ?? "";
    // Skip validation when the caller is only flipping flags (no platform/url touch).
    if (platform || url) {
      const reason = validateSocialProfile({ platform, url });
      if (reason) return { ok: false, error: reason };
    }
  }
  const { error } = await supabase
    .from("seo_social_profiles")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: humanizeSocialProfileError(error) };
  return { ok: true };
}

export async function deleteSeoSocialProfile(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { error } = await supabase.from("seo_social_profiles").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// seo_search_engine_verifications — singleton
// ---------------------------------------------------------------------------

const VERIFICATIONS_COLS =
  "google_site_verification, bing_site_verification, facebook_domain_verification, pinterest_site_verification, yandex_site_verification";

const EMPTY_VERIFICATIONS: SeoVerificationsRow = {
  google_site_verification: "",
  bing_site_verification: "",
  facebook_domain_verification: "",
  pinterest_site_verification: "",
  yandex_site_verification: "",
};

export async function fetchSeoVerifications(): Promise<SeoVerificationsRow> {
  if (!supabase) return EMPTY_VERIFICATIONS;
  const { data, error } = await supabase
    .from("seo_search_engine_verifications")
    .select(VERIFICATIONS_COLS)
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    console.error("[seo] fetchSeoVerifications", error.message);
    return EMPTY_VERIFICATIONS;
  }
  return (data as SeoVerificationsRow | null) ?? EMPTY_VERIFICATIONS;
}

export async function updateSeoVerifications(
  patch: Partial<SeoVerificationsRow>,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { data, error } = await supabase
    .from("seo_search_engine_verifications")
    .upsert({ id: 1, ...patch, updated_at: new Date().toISOString() }, { onConflict: "id" })
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Nothing was saved (sign-in required, or migration not applied)." };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// seo_analytics — singleton
// ---------------------------------------------------------------------------

const ANALYTICS_COLS =
  "google_analytics_id, google_tag_manager_id, meta_pixel_id, tiktok_pixel_id, consent_required";

const EMPTY_ANALYTICS: SeoAnalyticsRow = {
  google_analytics_id: "",
  google_tag_manager_id: "",
  meta_pixel_id: "",
  tiktok_pixel_id: "",
  consent_required: false,
};

export async function fetchSeoAnalytics(): Promise<SeoAnalyticsRow> {
  if (!supabase) return EMPTY_ANALYTICS;
  const { data, error } = await supabase
    .from("seo_analytics")
    .select(ANALYTICS_COLS)
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    console.error("[seo] fetchSeoAnalytics", error.message);
    return EMPTY_ANALYTICS;
  }
  return (data as SeoAnalyticsRow | null) ?? EMPTY_ANALYTICS;
}

export async function updateSeoAnalytics(
  patch: Partial<SeoAnalyticsRow>,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { data, error } = await supabase
    .from("seo_analytics")
    .upsert({ id: 1, ...patch, updated_at: new Date().toISOString() }, { onConflict: "id" })
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Nothing was saved (sign-in required, or migration not applied)." };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// product_shopping_attributes — 1:1 with products
// ---------------------------------------------------------------------------

const PRODUCT_SHOP_COLS =
  "product_id, brand_name, gtin, mpn, country_of_origin, material, return_policy_id, shipping_policy_id, is_original_imagery";

export async function fetchProductShoppingAttributes(
  productId: string,
): Promise<ProductShoppingRow | null> {
  if (!supabase || !productId) return null;
  const { data, error } = await supabase
    .from("product_shopping_attributes")
    .select(PRODUCT_SHOP_COLS)
    .eq("product_id", productId)
    .maybeSingle();
  if (error) {
    console.error("[seo] fetchProductShoppingAttributes", error.message);
    return null;
  }
  return (data as ProductShoppingRow | null) ?? null;
}

export async function upsertProductShoppingAttributes(
  productId: string,
  patch: Partial<Omit<ProductShoppingRow, "product_id">>,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  if (!productId) return { ok: false, error: "Save the product first." };
  const { error } = await supabase
    .from("product_shopping_attributes")
    .upsert(
      { product_id: productId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "product_id" },
    )
    .select("product_id");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
