import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  AdminListCard,
  AdminListSkeleton,
  AdminListEmpty,
  TableContainer,
  ADMIN_TABLE_HEAD,
  ADMIN_TABLE_ROW,
  adminTh,
  adminThEnd,
  adminTd,
  AdminRowEditLink,
} from "@/components/dashboard/admin-list-shell";
import {
  fetchPolicyPagesAdmin,
  type PolicyPageAdminRow,
} from "@/lib/supabase/policy-pages-admin";
import { supabase } from "@/lib/supabase/client";
import { FOOTER_DASHBOARD_BASE } from "@/config/footer-dashboard";
import { ADMIN_MSG_CATALOG_UNAVAILABLE } from "@/lib/admin-user-messages";

/** Public store site URL for “open live page” (optional). Set in admin environment as storefront origin. */
function storefrontPublicBaseUrl(): string | null {
  const raw = import.meta.env.VITE_STOREFRONT_ORIGIN?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

/** Section 2 on Footer updates: editable footer items (`policy_pages`). */
export function FooterItemsListSection() {
  const [rows, setRows] = useState<PolicyPageAdminRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase) {
      toast.error(ADMIN_MSG_CATALOG_UNAVAILABLE);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await fetchPolicyPagesAdmin());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load footer items.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const publicBase = storefrontPublicBaseUrl();

  return (
    <AdminListCard
      title="Footer items"
      description="These links appear in your store footer under the customer care heading, after Contact us. Set each item’s title, slug, and content; order is controlled by the sort field."
      headerRight={
        <Button type="button" size="sm" asChild>
          <Link to={`${FOOTER_DASHBOARD_BASE}/new`}>
            <Plus className="mr-2 h-4 w-4" />
            Add footer item
          </Link>
        </Button>
      }
    >
      {loading ? (
        <AdminListSkeleton />
      ) : rows.length === 0 ? (
        <AdminListEmpty>No footer items yet. Add one to show it in your store footer.</AdminListEmpty>
      ) : (
        <TableContainer>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className={ADMIN_TABLE_HEAD}>
                <th className={adminTh()}>Title</th>
                <th className={adminTh()}>URL slug</th>
                <th className={adminTh()}>Sort</th>
                <th className={adminThEnd()} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const live = publicBase ? `${publicBase}/${encodeURIComponent(r.slug)}` : null;
                return (
                  <tr key={r.id} className={ADMIN_TABLE_ROW}>
                    <td className={adminTd("font-medium")}>{r.title}</td>
                    <td className={adminTd("font-mono text-xs text-muted-foreground")}>{r.slug}</td>
                    <td className={adminTd("text-muted-foreground")}>{r.sort_order}</td>
                    <td className={adminTd("text-right")}>
                      <div className="flex items-center justify-end gap-2">
                        {live ? (
                          <Button variant="ghost" size="sm" className="h-8 px-2" asChild>
                            <a href={live} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                              <span className="sr-only">Open on your store</span>
                            </a>
                          </Button>
                        ) : null}
                        <AdminRowEditLink to={`${FOOTER_DASHBOARD_BASE}/${r.id}`} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableContainer>
      )}
    </AdminListCard>
  );
}
