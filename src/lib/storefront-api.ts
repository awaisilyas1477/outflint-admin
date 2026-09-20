import { ADMIN_MSG_STOREFRONT_URL_MISSING } from "@/lib/admin-user-messages";

/** Public storefront base URL for admin actions that call your live store (e.g. newsletter send). */
export function getStorefrontOrigin(): string {
  const raw = import.meta.env.VITE_STOREFRONT_ORIGIN?.trim();
  if (!raw) {
    throw new Error(ADMIN_MSG_STOREFRONT_URL_MISSING);
  }
  return raw.replace(/\/$/, "");
}
