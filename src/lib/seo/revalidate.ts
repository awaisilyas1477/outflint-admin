/**
 * Tells the storefront to refresh its server-rendered HTML for given subjects.
 *
 * Auth: prefers the admin's Supabase JWT (no secret in the bundle). Falls back
 * to an optional `VITE_REVALIDATE_SECRET` for local dev only — do NOT set this
 * in production browsers. Production deployments use the JWT path; the
 * storefront verifies the user is an active admin before revalidating.
 *
 * Configure once:
 *   VITE_STOREFRONT_ORIGIN=https://your-store.example.com   (required)
 *   VITE_REVALIDATE_SECRET=...                              (optional, dev only)
 */

import { supabase } from "@/lib/supabase/client";

export type RevalidatePayload = {
  paths?: string[];
  productSlug?: string;
  collectionSlug?: string;
  policySlug?: string;
  homeSectionSlug?: string;
  all?: boolean;
  tag?: string;
  tags?: string[];
};

function storefrontOrigin(): string | null {
  const raw = import.meta.env.VITE_STOREFRONT_ORIGIN?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

/**
 * Posts to /api/revalidate. Best-effort: failures are logged but never throw,
 * so a content save UI can call this without try/catch and the user still
 * sees their save succeed even if the storefront is briefly unreachable.
 */
export async function revalidateStorefront(payload: RevalidatePayload): Promise<void> {
  const origin = storefrontOrigin();
  if (!origin) return;

  // Minimal JSON contract used by the storefront revalidate API.
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  const secret = import.meta.env.VITE_REVALIDATE_SECRET?.trim();
  if (secret) {
    headers["x-revalidate-secret"] = secret;
  } else if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      const jwt = data.session?.access_token;
      if (jwt) headers["Authorization"] = `Bearer ${jwt}`;
    } catch {
      /* no-op — request will still go out without auth and 403 below */
    }
  }

  try {
    // Fire-and-forget invalidation request; save flows must stay responsive.
    const res = await fetch(`${origin}/api/revalidate`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      keepalive: true,
    });
    if (!res.ok) {
      console.warn("[revalidate] storefront responded", res.status);
    }
  } catch (e) {
    console.warn("[revalidate] failed", e);
  }
}
