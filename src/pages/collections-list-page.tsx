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
import { fetchCollections } from "@/lib/supabase/catalog";
import type { CollectionRow } from "@/lib/supabase/catalog-types";
import { supabase } from "@/lib/supabase/client";
import { collectionIsTagBased } from "@/lib/catalog/collection-type";

export function CollectionsListPage() {
  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  async function load() {
    if (!supabase) {
      toast.error(ADMIN_MSG_CATALOG_UNAVAILABLE);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchCollections();
      setRows(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load collections.");
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
        title="Collections"
        description="Merchandising groups for the site — a product can sit in none, one, or several collections."
        actions={
          <Button type="button" size="sm" asChild>
            <Link to="/dashboard/collections/new">
              <Plus className="mr-2 h-4 w-4" />
              Add collection
            </Link>
          </Button>
        }
      />

      <AdminListCard
        title="All collections"
        description="Empty collections still appear on the storefront; assign products from each product's edit screen."
      >
        {loading ? (
          <AdminListSkeleton />
        ) : rows.length === 0 ? (
          <AdminListEmpty>No collections yet.</AdminListEmpty>
        ) : (
          <TableContainer>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={ADMIN_TABLE_HEAD}>
                  <th className={adminTh()}>Name</th>
                  <th className={adminTh()}>Slug</th>
                  <th className={adminTh()}>Type</th>
                  <th className={adminTh()}>Sort</th>
                  <th className={adminThEnd()} />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className={ADMIN_TABLE_ROW}>
                    <td className={adminTd("font-medium")}>{c.name}</td>
                    <td className={adminTd("font-mono text-xs text-muted-foreground")}>{c.slug}</td>
                    <td className={adminTd()}>
                      {collectionIsTagBased(c.collection_type) ? (
                        <Badge variant="secondary">Tag-based</Badge>
                      ) : (
                        <Badge variant="outline">Manual</Badge>
                      )}
                    </td>
                    <td className={adminTd("tabular-nums text-muted-foreground")}>{c.sort_order}</td>
                    <td className={adminTd("text-right")}>
                      <AdminRowEditLink to={`/dashboard/collections/${c.id}`} />
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
