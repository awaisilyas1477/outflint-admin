import { supabase } from "@/lib/supabase/client";

export type NewsletterCampaignRow = {
  id: string;
  subject: string;
  body_html: string;
  recipient_count: number;
  sent_ok: number;
  sent_failed: number;
  created_at: string;
  completed_at: string | null;
  created_by_auth_id: string | null;
};

function mapRow(r: Record<string, unknown>): NewsletterCampaignRow {
  return {
    id: String(r.id ?? ""),
    subject: String(r.subject ?? ""),
    body_html: String(r.body_html ?? ""),
    recipient_count: Number(r.recipient_count ?? 0),
    sent_ok: Number(r.sent_ok ?? 0),
    sent_failed: Number(r.sent_failed ?? 0),
    created_at: String(r.created_at ?? ""),
    completed_at: r.completed_at == null ? null : String(r.completed_at),
    created_by_auth_id: r.created_by_auth_id == null ? null : String(r.created_by_auth_id),
  };
}

export async function fetchNewsletterCampaignsAdmin(limit = 100): Promise<NewsletterCampaignRow[]> {
  if (!supabase) return [];
  const cap = Math.min(Math.max(limit, 1), 300);
  const { data, error } = await supabase
    .from("newsletter_campaigns")
    .select(
      "id, subject, body_html, recipient_count, sent_ok, sent_failed, created_at, completed_at, created_by_auth_id",
    )
    .order("created_at", { ascending: false })
    .limit(cap);

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function fetchNewsletterCampaignById(id: string): Promise<NewsletterCampaignRow | null> {
  if (!supabase || !id) return null;
  const { data, error } = await supabase
    .from("newsletter_campaigns")
    .select(
      "id, subject, body_html, recipient_count, sent_ok, sent_failed, created_at, completed_at, created_by_auth_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;
  return mapRow(data as Record<string, unknown>);
}

export type NewsletterCampaignRecipientRow = {
  id: string;
  email: string;
  subscription_id: string | null;
  status: "sent" | "failed";
  error_message: string | null;
  created_at: string;
};

function mapRecipientRow(r: Record<string, unknown>): NewsletterCampaignRecipientRow {
  const st = String(r.status ?? "");
  return {
    id: String(r.id ?? ""),
    email: String(r.email ?? ""),
    subscription_id: r.subscription_id == null ? null : String(r.subscription_id),
    status: st === "failed" ? "failed" : "sent",
    error_message: r.error_message == null ? null : String(r.error_message),
    created_at: String(r.created_at ?? ""),
  };
}

export async function fetchNewsletterCampaignRecipientsAdmin(
  campaignId: string,
): Promise<NewsletterCampaignRecipientRow[]> {
  if (!supabase || !campaignId) return [];
  const { data, error } = await supabase
    .from("newsletter_campaign_recipients")
    .select("id, email, subscription_id, status, error_message, created_at")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapRecipientRow(row as Record<string, unknown>));
}
