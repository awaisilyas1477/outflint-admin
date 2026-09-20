import type { OrderStatus } from "@/lib/supabase/orders";

const STORAGE_KEY = "ecom-admin-orders-list-prefs-v1";

export type OrderDateRange = "all" | "today" | "week" | "month";

export type OrdersListPrefs = {
  status: OrderStatus | "all";
  dateRange: OrderDateRange;
  search: string;
};

const DEFAULTS: OrdersListPrefs = {
  status: "all",
  dateRange: "all",
  search: "",
};

export function loadOrdersListPrefs(): OrdersListPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<OrdersListPrefs>;
    return {
      status: p.status ?? DEFAULTS.status,
      dateRange: p.dateRange ?? DEFAULTS.dateRange,
      search: typeof p.search === "string" ? p.search : DEFAULTS.search,
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveOrdersListPrefs(prefs: OrdersListPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore quota */
  }
}
