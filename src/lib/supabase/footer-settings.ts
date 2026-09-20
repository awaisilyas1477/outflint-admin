import { supabase } from "@/lib/supabase/client";

export type FooterSettingsRow = {
  id: number;
  customer_care_title: string;
  updated_at: string;
};

function logFooter(op: string, message: string | undefined) {
  if (!message) return;
  console.error(`[footer-settings] ${op}`, message);
}

export async function fetchFooterSettings(): Promise<FooterSettingsRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("footer_settings")
    .select("id, customer_care_title, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    logFooter("fetchFooterSettings", error.message);
    return null;
  }
  return data as FooterSettingsRow | null;
}

export async function updateFooterSettingsTitle(
  customerCareTitle: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const title = customerCareTitle.trim() || "Customer care";
  const { data, error } = await supabase
    .from("footer_settings")
    .update({
      customer_care_title: title,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1)
    .select("id");
  if (error) {
    logFooter("updateFooterSettingsTitle", error.message);
    return { ok: false, error: error.message };
  }
  const rows = Array.isArray(data) ? data : data != null ? [data] : [];
  if (rows.length === 0) {
    return {
      ok: false,
      error:
        "Could not save footer heading. Sign in as an active admin, or ensure migration `footer_settings` ran on this database.",
    };
  }
  return { ok: true };
}
