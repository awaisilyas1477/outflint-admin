import { supabase } from "@/lib/supabase/client";

export type PolicyPageAdminRow = {
  id: string;
  slug: string;
  title: string;
  content_html: string;
  sort_order: number;
  updated_at: string;
};

function logPolicy(op: string, message: string | undefined) {
  if (!message) return;
  console.error(`[policy-pages-admin] ${op}`, message);
}

export async function fetchPolicyPagesAdmin(): Promise<PolicyPageAdminRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("policy_pages")
    .select("id, slug, title, content_html, sort_order, updated_at")
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (error) {
    logPolicy("fetchPolicyPagesAdmin", error.message);
    return [];
  }
  if (!data?.length) return [];
  return data.map((r) => ({
    id: String(r.id),
    slug: String(r.slug ?? ""),
    title: String(r.title ?? ""),
    content_html: String(r.content_html ?? ""),
    sort_order: typeof r.sort_order === "number" ? r.sort_order : 0,
    updated_at: String(r.updated_at ?? ""),
  }));
}

export async function fetchPolicyPageById(id: string): Promise<PolicyPageAdminRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("policy_pages")
    .select("id, slug, title, content_html, sort_order, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    logPolicy("fetchPolicyPageById", error.message);
    return null;
  }
  if (!data) return null;
  return {
    id: String(data.id),
    slug: String(data.slug ?? ""),
    title: String(data.title ?? ""),
    content_html: String(data.content_html ?? ""),
    sort_order: typeof data.sort_order === "number" ? data.sort_order : 0,
    updated_at: String(data.updated_at ?? ""),
  };
}

export async function insertPolicyPage(payload: {
  slug: string;
  title: string;
  content_html: string;
  sort_order: number;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { data, error } = await supabase
    .from("policy_pages")
    .insert({
      slug: payload.slug,
      title: payload.title,
      content_html: payload.content_html,
      sort_order: payload.sort_order,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    logPolicy("insertPolicyPage", error.message);
    return { ok: false, error: error.message };
  }
  if (!data?.id) return { ok: false, error: "No id returned" };
  return { ok: true, id: String(data.id) };
}

export async function updatePolicyPage(
  id: string,
  payload: {
    slug: string;
    title: string;
    content_html: string;
    sort_order: number;
  },
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { error } = await supabase
    .from("policy_pages")
    .update({
      slug: payload.slug,
      title: payload.title,
      content_html: payload.content_html,
      sort_order: payload.sort_order,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    logPolicy("updatePolicyPage", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function deletePolicyPage(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { error } = await supabase.from("policy_pages").delete().eq("id", id);
  if (error) {
    logPolicy("deletePolicyPage", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
