import { supabase } from "@/lib/supabase/client";

export type PolicyPageSummary = {
  slug: string;
  title: string;
  sort_order: number;
};

export async function fetchPolicyPageSummaries(): Promise<PolicyPageSummary[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("policy_pages")
    .select("slug, title, sort_order")
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (error || !data?.length) return [];
  return data.map((r) => ({
    slug: String(r.slug ?? ""),
    title: String(r.title ?? ""),
    sort_order: typeof r.sort_order === "number" ? r.sort_order : 0,
  }));
}
