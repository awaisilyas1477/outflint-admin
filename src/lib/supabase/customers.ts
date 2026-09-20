import { supabase } from "@/lib/supabase/client";

const USER_SELECT =
  "id, auth_id, first_name, last_name, phone, gender, date_of_birth, signup_provider, created_at, updated_at";

export type PublicUserRow = {
  id: string;
  auth_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  gender: string | null;
  date_of_birth: string | null;
  signup_provider: string | null;
  created_at: string;
  updated_at: string;
};

function logCustomers(op: string, message: string | undefined) {
  if (!message) return;
  console.error(`[customers] ${op}`, message);
}

/** Customer profiles (requires users_select_admin policy). */
export async function fetchCustomersAdmin(limit = 200): Promise<PublicUserRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("users")
    .select(USER_SELECT)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 500));
  if (error) {
    logCustomers("fetchCustomersAdmin", error.message);
    return [];
  }
  return (data ?? []) as PublicUserRow[];
}

export type CustomersPageResult = {
  rows: PublicUserRow[];
  total: number;
};

export async function fetchCustomersAdminPaginated(options: {
  page: number;
  pageSize: number;
  search?: string;
}): Promise<CustomersPageResult> {
  if (!supabase) return { rows: [], total: 0 };
  const pageSize = Math.min(Math.max(options.pageSize, 1), 100);
  const page = Math.max(options.page, 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("users")
    .select(USER_SELECT, { count: "exact" })
    .order("created_at", { ascending: false });

  const search = options.search?.trim();
  if (search) {
    const term = `%${search}%`;
    q = q.or(
      [
        `phone.ilike.${term}`,
        `first_name.ilike.${term}`,
        `last_name.ilike.${term}`,
      ].join(","),
    );
  }

  const { data, error, count } = await q.range(from, to);
  if (error) {
    logCustomers("fetchCustomersAdminPaginated", error.message);
    return { rows: [], total: 0 };
  }
  return { rows: (data ?? []) as PublicUserRow[], total: count ?? 0 };
}

export async function fetchCustomerByIdAdmin(id: string): Promise<PublicUserRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("users")
    .select(USER_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    logCustomers("fetchCustomerByIdAdmin", error.message);
    return null;
  }
  return (data ?? null) as PublicUserRow | null;
}

/** Order counts per user_id from recent orders (bounded query). */
export async function fetchOrderCountByUserIds(
  userIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!supabase || userIds.length === 0) return map;
  const { data, error } = await supabase
    .from("orders")
    .select("user_id")
    .not("user_id", "is", null)
    .in("user_id", userIds);
  if (error) {
    logCustomers("fetchOrderCountByUserIds", error.message);
    return map;
  }
  for (const row of data ?? []) {
    const uid = (row as { user_id: string }).user_id;
    map.set(uid, (map.get(uid) ?? 0) + 1);
  }
  return map;
}

export type CustomerUpdatePatch = {
  first_name?: string;
  last_name?: string;
  phone?: string;
};

export async function updateCustomerAdmin(
  id: string,
  patch: CustomerUpdatePatch,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { error } = await supabase
    .from("users")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    logCustomers("updateCustomerAdmin", error.message);
    return { ok: false, error: error.message };
  }
  const { logAdminAction } = await import("@/lib/audit-log");
  await logAdminAction("update", "users", id, patch as Record<string, unknown>);
  return { ok: true };
}
