import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { toast } from "sonner";
import { ADMIN_MSG_CATALOG_UNAVAILABLE } from "@/lib/admin-user-messages";
import {
  AdminListCard,
  AdminListSkeleton,
  AdminListEmpty,
  ADMIN_LIST_PAGE_CLASS,
  TableContainer,
  ADMIN_TABLE_HEAD,
  ADMIN_TABLE_ROW,
  adminTh,
  adminThEnd,
  adminTd,
  AdminRowEditLink,
} from "@/components/dashboard/admin-list-shell";
import { fetchSizes } from "@/lib/supabase/catalog";
import type { SizeRow } from "@/lib/supabase/catalog-types";
import { supabase } from "@/lib/supabase/client";

export function SizesListPage() {
  const [rows, setRows] = useState<SizeRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!supabase) {
      toast.error(ADMIN_MSG_CATALOG_UNAVAILABLE);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchSizes();
      setRows(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load sizes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, []);

  return (
    <div className={ADMIN_LIST_PAGE_CLASS}>
      <PageHeader
        title="Sizes"
        description="Global list used when creating product variants (S, M, L, shoe sizes, etc.)."
        actions={
          <Button type="button" size="sm" asChild>
            <Link to="/dashboard/sizes/new">
              <Plus className="mr-2 h-4 w-4" />
              Add size
            </Link>
          </Button>
        }
      />

      <AdminListCard
        title="All sizes"
        description="Display name is customer-facing; name is the internal key. Inactive rows stay on saved variants but are hidden from new picks. Deleting clears FK on variants."
      >
        {loading ? (
          <AdminListSkeleton />
        ) : rows.length === 0 ? (
          <AdminListEmpty>No sizes yet.</AdminListEmpty>
        ) : (
          <TableContainer>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={ADMIN_TABLE_HEAD}>
                  <th className={adminTh()}>Display name</th>
                  <th className={adminTh()}>Name</th>
                  <th className={adminTh()}>Type</th>
                  <th className={adminTh()}>Sort</th>
                  <th className={adminTh()}>Status</th>
                  <th className={adminThEnd()} />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className={ADMIN_TABLE_ROW}>
                    <td className={adminTd("font-medium")}>{s.display_name}</td>
                    <td className={adminTd("font-mono text-xs text-muted-foreground")}>{s.name}</td>
                    <td className={adminTd("capitalize")}>{s.size_type}</td>
                    <td className={adminTd("tabular-nums text-muted-foreground")}>{s.sort_order}</td>
                    <td className={adminTd()}>
                      {s.is_active ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </td>
                    <td className={adminTd("text-right")}>
                      <AdminRowEditLink to={`/dashboard/sizes/${s.id}`} />
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
