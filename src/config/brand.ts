/**
 * Product branding — set in `.env` (client vars must use the `VITE_` prefix).
 *
 * Static assets live under `/public/brand` (served from `/brand/...`).
 *
 * @example
 * VITE_APP_NAME=SimpleCartStore Admin
 * VITE_APP_TAGLINE=Admin
 * VITE_APP_DESCRIPTION=Operate catalog, promos, and media for your storefront.
 * VITE_APP_HERO_TITLE=Your store control center
 */

function pick(
  value: string | undefined,
  fallback: string,
): string {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : fallback;
}

export const APP_NAME = pick(import.meta.env.VITE_APP_NAME, "SimpleCartStore Admin");

export const APP_TAGLINE = pick(import.meta.env.VITE_APP_TAGLINE, "Admin");

export const APP_DESCRIPTION = pick(
  import.meta.env.VITE_APP_DESCRIPTION,
  "Run the catalog, promotions, and media for your storefront from one place.",
);

export const APP_HERO_TITLE = pick(
  import.meta.env.VITE_APP_HERO_TITLE,
  "Operate your SimpleCartStore store",
);

/** Full wordmark (sidebar / auth). */
export const APP_LOGO_SRC = "/brand/logo.svg";

/** Cart mark only (collapsed sidebar / compact UI). */
export const APP_MARK_SRC = "/brand/mark.svg";
