import { supabase } from "@/lib/supabase/client";

export type AuditLogRow = {
  id: string;
  admin_auth_id: string | null;
  action: string;
  entity_table: string;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export async function logAdminAction(
  action: string,
  entityTable: string,
  entityId?: string | null,
  payload?: Record<string, unknown>,
): Promise<void> {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  const adminAuthId = sessionData.session?.user?.id ?? null;
  const { error } = await supabase.from("audit_logs").insert({
    admin_auth_id: adminAuthId,
    action,
    entity_table: entityTable,
    entity_id: entityId ?? null,
    payload: payload ?? null,
  });
  if (error) {
    console.error("[audit-log]", error.message);
  }
}

export async function fetchAuditLogsAdmin(limit = 100): Promise<AuditLogRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, admin_auth_id, action, entity_table, entity_id, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 300));
  if (error) {
    console.error("[audit-log] fetch", error.message);
    return [];
  }
  return (data ?? []) as AuditLogRow[];
}
