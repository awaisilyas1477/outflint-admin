import { supabase } from "@/lib/supabase/client";

export type HeaderNavMenuItemRow = {
  id: string;
  name: string;
  label: string;
  slug: string;
  collection_id: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function logNav(op: string, message: string | undefined) {
  if (!message) return;
  console.error(`[header_nav_menu] ${op}`, message);
}

export async function fetchHeaderNavMenuItemsAdmin(): Promise<HeaderNavMenuItemRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("header_nav_menu_items")
    .select(
      "id, name, label, slug, collection_id, sort_order, is_active, created_at, updated_at",
    )
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (error) {
    logNav("fetch", error.message);
    return [];
  }
  return (data ?? []) as HeaderNavMenuItemRow[];
}

export async function insertHeaderNavMenuItem(input: {
  name: string;
  label: string;
  collection_id: string;
  sort_order: number;
  is_active: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { error } = await supabase.from("header_nav_menu_items").insert({
    name: input.name.trim(),
    label: input.label.trim(),
    collection_id: input.collection_id,
    sort_order: input.sort_order,
    is_active: input.is_active,
  });
  if (error) {
    logNav("insert", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function updateHeaderNavMenuItem(
  id: string,
  input: {
    name: string;
    label: string;
    collection_id: string;
    sort_order: number;
    is_active: boolean;
  },
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { error } = await supabase
    .from("header_nav_menu_items")
    .update({
      name: input.name.trim(),
      label: input.label.trim(),
      collection_id: input.collection_id,
      sort_order: input.sort_order,
      is_active: input.is_active,
    })
    .eq("id", id);
  if (error) {
    logNav("update", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function deleteHeaderNavMenuItem(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { error } = await supabase.from("header_nav_menu_items").delete().eq("id", id);
  if (error) {
    logNav("delete", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
