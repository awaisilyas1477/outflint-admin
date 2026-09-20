import { supabase } from "@/lib/supabase/client";
import type { AdminRow } from "@/lib/supabase/types";

/**
 * Fetch the signed-in user's admin row. RLS allows select only when
 * `auth.uid() = auth_id` for the active admin row.
 */
export async function fetchAdminForAuthUser(
  authUserId: string,
): Promise<AdminRow | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("admins")
    .select("id, auth_id, email, status, created_at, updated_at")
    .eq("auth_id", authUserId)
    .maybeSingle();

  if (error) {
    console.error("[admins] fetch error:", error.message);
    return null;
  }

  return data as AdminRow | null;
}

export function isActiveAdmin(admin: AdminRow | null): admin is AdminRow {
  return admin !== null && admin.status === "active";
}
