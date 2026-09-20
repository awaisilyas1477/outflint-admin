import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import {
  AdminListCard,
  AdminListEmpty,
  AdminListSkeleton,
  ADMIN_LIST_PAGE_CLASS,
  TableContainer,
  ADMIN_TABLE_HEAD,
  ADMIN_TABLE_ROW,
  adminTh,
  adminTd,
} from "@/components/dashboard/admin-list-shell";
import { fetchAuditLogsAdmin, type AuditLogRow } from "@/lib/audit-log";

function formatAction(action: string): string {
  return action.replace(/_/g, " ");
}

export function AuditLogPage() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchAuditLogsAdmin(200).then((data) => {
      setRows(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className={ADMIN_LIST_PAGE_CLASS}>
      <PageHeader
        title="Activity audit log"
        description="Recent admin actions — deletes, status changes, profile edits, and bulk updates."
      />

      <AdminListCard
        title="Recent activity"
        description={`Last ${rows.length} logged events.`}
      >
        {loading ? (
          <AdminListSkeleton rows={6} />
        ) : rows.length === 0 ? (
          <AdminListEmpty icon={ScrollText}>No audit events yet.</AdminListEmpty>
        ) : (
          <TableContainer>
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className={ADMIN_TABLE_HEAD}>
                  <th className={adminTh()}>When</th>
                  <th className={adminTh()}>Action</th>
                  <th className={adminTh()}>Entity</th>
                  <th className={adminTh()}>Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={ADMIN_TABLE_ROW}>
                    <td className={adminTd("whitespace-nowrap text-muted-foreground")}>
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className={adminTd()}>
                      <Badge variant="outline" className="capitalize">
                        {formatAction(r.action)}
                      </Badge>
                    </td>
                    <td className={adminTd()}>
                      <span className="font-mono text-xs">{r.entity_table}</span>
                      {r.entity_id ? (
                        <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                          {r.entity_id}
                        </span>
                      ) : null}
                    </td>
                    <td className={adminTd("max-w-md")}>
                      {r.payload && Object.keys(r.payload).length > 0 ? (
                        <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
                          {JSON.stringify(r.payload, null, 0)}
                        </pre>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableContainer>
        )}
      </AdminListCard>
    </div>
  );
}
