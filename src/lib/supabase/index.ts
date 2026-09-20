export { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
export type { Database } from "@/lib/supabase/client";
export type { AdminRow } from "@/lib/supabase/types";
export {
  fetchAdminForAuthUser,
  isActiveAdmin,
} from "@/lib/supabase/admins";
export * from "@/lib/supabase/orders";
export * from "@/lib/supabase/customers";
export * from "@/lib/supabase/reviews-admin";
export * from "@/lib/supabase/dashboard-stats";
export * from "@/lib/supabase/wishlist-admin";
export * from "@/lib/supabase/store-settings";
