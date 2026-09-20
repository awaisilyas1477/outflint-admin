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
import { fetchHomePageSections, type HomePageSectionWithTags } from "@/lib/supabase/catalog";
import { supabase } from "@/lib/supabase/client";

export function HomeSectionsListPage() {
  const [rows, setRows] = useState<HomePageSectionWithTags[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!supabase) {
      toast.error(ADMIN_MSG_CATALOG_UNAVAILABLE);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchHomePageSections();
      setRows(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load home sections.");
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
        title="Home sections"
        description="Named product rows on the storefront home page — each section matches products by one or more tags (any tag matches)."
        actions={
          <Button type="button" size="sm" asChild>
            <Link to="/dashboard/home-sections/new">
              <Plus className="mr-2 h-4 w-4" />
              Add section
            </Link>
          </Button>
        }
      />

      <AdminListCard
        title="All sections"
        description="Inactive sections are hidden on the site. Sort order controls top-to-bottom placement."
      >
        {loading ? (
          <AdminListSkeleton />
        ) : rows.length === 0 ? (
          <AdminListEmpty>No home sections yet.</AdminListEmpty>
        ) : (
          <TableContainer>
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className={ADMIN_TABLE_HEAD}>
                  <th className={adminTh()}>Name</th>
                  <th className={adminTh()}>Slug</th>
                  <th className={adminTh()}>Status</th>
                  <th className={adminTh()}>Assigned Tags</th>
                  <th className={adminTh()}>Sort</th>
                  <th className={adminThEnd()} />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className={ADMIN_TABLE_ROW}>
                    <td className={adminTd("font-medium")}>{s.name}</td>
                    <td className={adminTd("font-mono text-xs text-muted-foreground")}>{s.slug}</td>
                    <td className={adminTd()}>
                      {s.is_active ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </td>
                    <td className={adminTd("max-w-[min(280px,32vw)] align-top")}>
                      {s.tags.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No tags assigned</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {s.tags.map((t) => (
                            <Link
                              key={t.id}
                              to={`/dashboard/tags/${t.id}`}
                              className="inline-flex max-w-full shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Badge
                                variant="outline"
                                className="max-w-44 truncate font-normal hover:bg-muted"
                                title={t.label}
                              >
                                {t.label}
                              </Badge>
                            </Link>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className={adminTd("tabular-nums text-muted-foreground")}>{s.sort_order}</td>
                    <td className={adminTd("text-right")}>
                      <AdminRowEditLink to={`/dashboard/home-sections/${s.id}`}>
                        Edit
                      </AdminRowEditLink>
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
