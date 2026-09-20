import { supabase } from "@/lib/supabase/client";

export type NewsletterSubscriptionRow = {
  id: string;
  /** App profile id when checkout was signed in; null = guest (email-only) opt-in. */
  user_id: string | null;
  email: string;
  subscribed: boolean;
  created_at: string;
  updated_at: string;
};

function mapRow(r: Record<string, unknown>): NewsletterSubscriptionRow {
  const uid = r.user_id;
  return {
    id: String(r.id ?? ""),
    user_id: uid == null || uid === "" ? null : String(uid),
    email: String(r.email ?? ""),
    subscribed: Boolean(r.subscribed),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

export async function fetchNewsletterSubscriptionsAdmin(
  limit = 500,
): Promise<NewsletterSubscriptionRow[]> {
  if (!supabase) return [];
  const cap = Math.min(Math.max(limit, 1), 1000);
  const { data, error } = await supabase
    .from("newsletter_subscriptions")
    .select("id, user_id, email, subscribed, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(cap);

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function setNewsletterSubscribedAdmin(
  subscriptionId: string,
  subscribed: boolean,
): Promise<void> {
  if (!supabase || !subscriptionId) {
    throw new Error("Database is not configured.");
  }
  const { error } = await supabase
    .from("newsletter_subscriptions")
    .update({ subscribed })
    .eq("id", subscriptionId);
  if (error) {
    throw new Error(error.message);
  }
}
