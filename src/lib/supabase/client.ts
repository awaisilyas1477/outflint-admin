import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AdminRow } from "@/lib/supabase/types";
import type {
  CollectionRow,
  InventoryRow,
  ProductRow,
  ProductVariantDbRow,
} from "@/lib/supabase/catalog-types";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(url && anonKey);

/** Stable across Vite HMR so we never construct two GoTrue clients for the same project. */
const GLOBAL_CLIENT_KEY = "__ecom_admin_supabase_singleton__" as const;

type GlobalWithClient = typeof globalThis & {
  [GLOBAL_CLIENT_KEY]?: SupabaseClient;
};

function getBrowserClient(): SupabaseClient | null {
  const g = globalThis as GlobalWithClient;

  if (!url || !anonKey) {
    console.warn("[admin] Store database URL or key is not configured for this admin build.");
    return null;
  }

  if (g[GLOBAL_CLIENT_KEY]) {
    return g[GLOBAL_CLIENT_KEY];
  }

  g[GLOBAL_CLIENT_KEY] = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
    },
  });

  return g[GLOBAL_CLIENT_KEY];
}

/** Browser client — anon key only; RLS applies. `null` when env is not configured. */
export const supabase: SupabaseClient | null = getBrowserClient();

export type Database = {
  public: {
    Tables: {
      admins: {
        Row: AdminRow;
      };
      collections: {
        Row: CollectionRow;
      };
      products: {
        Row: ProductRow;
      };
      product_variants: {
        Row: ProductVariantDbRow;
      };
      inventory: {
        Row: InventoryRow;
      };
    };
  };
};
