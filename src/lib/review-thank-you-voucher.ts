/**
 * Best-effort: ask storefront to email a 5% thank-you voucher after review approval.
 */

import { supabase } from "@/lib/supabase/client";

function storefrontOrigin(): string | null {
  const raw = import.meta.env.VITE_STOREFRONT_ORIGIN?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

export function requestReviewThankYouVoucher(reviewId: string): void {
  const origin = storefrontOrigin();
  if (!origin || !reviewId.trim()) return;

  void (async () => {
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
        /* no-op */
      }
    }

    try {
      const res = await fetch(`${origin}/api/admin/review-thank-you-voucher`, {
        method: "POST",
        headers,
        body: JSON.stringify({ reviewId }),
        keepalive: true,
      });
      if (!res.ok) {
        console.warn("[review-thank-you-voucher] storefront responded", res.status);
      }
    } catch (e) {
      console.warn("[review-thank-you-voucher] failed", e);
    }
  })();
}
