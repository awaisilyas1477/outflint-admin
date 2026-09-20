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
import { fetchTagsWithProductCount, type TagWithCountRow } from "@/lib/supabase/catalog";
import { supabase } from "@/lib/supabase/client";

export function TagsListPage() {
  const [rows, setRows] = useState<TagWithCountRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!supabase) {
      toast.error(ADMIN_MSG_CATALOG_UNAVAILABLE);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await fetchTagsWithProductCount());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load tags.");
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
        title="Tags"
        description="Reusable labels for products and tag-based collections (e.g. featured, new-arrival)."
        actions={
          <Button type="button" size="sm" asChild>
            <Link to="/dashboard/tags/new">
              <Plus className="mr-2 h-4 w-4" />
              Add tag
            </Link>
          </Button>
        }
      />

      <AdminListCard
        title="All tags"
        description="The internal name is lowercase and URL-safe; the label is shown in pickers."
      >
        {loading ? (
          <AdminListSkeleton />
        ) : rows.length === 0 ? (
          <AdminListEmpty>No tags yet.</AdminListEmpty>
        ) : (
          <TableContainer>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={ADMIN_TABLE_HEAD}>
                  <th className={adminTh()}>Label</th>
                  <th className={adminTh()}>Name (Slug)</th>
                  <th className={adminTh()}>Products</th>
                  <th className={adminThEnd()} />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className={ADMIN_TABLE_ROW}>
                    <td className={adminTd("font-medium")}>{t.label}</td>
                    <td className={adminTd("font-mono text-xs text-muted-foreground")}>{t.name}</td>
                    <td className={adminTd()}>
                      {t.product_count > 0 ? (
                        <Link
                          to={`/dashboard/products?tag=${encodeURIComponent(t.name)}`}
                          className="inline-flex items-center gap-1.5 transition hover:opacity-80"
                          title={`View ${t.product_count} products with tag "${t.label}"`}
                        >
                          <Badge variant="secondary" className="font-normal tabular-nums">
                            {t.product_count} {t.product_count === 1 ? "product" : "products"}
                          </Badge>
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">0 products</span>
                      )}
                    </td>
                    <td className={adminTd("text-right")}>
                      <AdminRowEditLink to={`/dashboard/tags/${t.id}`} />
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
