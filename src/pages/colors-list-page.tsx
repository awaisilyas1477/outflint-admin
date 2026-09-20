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
import { fetchColors } from "@/lib/supabase/catalog";
import type { ColorRow } from "@/lib/supabase/catalog-types";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

function SwatchPreview({ color }: { color: ColorRow }) {
  if (color.swatch_image_url?.trim()) {
    return (
      <span className="inline-block h-8 w-8 overflow-hidden rounded border border-border">
        <img src={color.swatch_image_url} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }
  const hx = color.hex?.trim();
  return (
    <span
      className="inline-block h-8 w-8 rounded border border-border"
      style={
        hx
          ? { backgroundColor: hx }
          : color.rgb?.trim()
            ? { backgroundColor: color.rgb }
            : { backgroundColor: "#e5e5e5" }
      }
    />
  );
}

export function ColorsListPage() {
  const [rows, setRows] = useState<ColorRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!supabase) {
      toast.error(ADMIN_MSG_CATALOG_UNAVAILABLE);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await fetchColors());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load colors.");
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
        title="Colors"
        description="Color swatches for variants: display name, optional hex, RGB, or texture image, and whether it appears in pickers."
        actions={
          <Button type="button" size="sm" asChild>
            <Link to="/dashboard/colors/new">
              <Plus className="mr-2 h-4 w-4" />
              Add color
            </Link>
          </Button>
        }
      />

      <AdminListCard
        title="All colors"
        description="Inactive colors stay on saved variants but are hidden from new selections until re-activated."
      >
        {loading ? (
          <AdminListSkeleton />
        ) : rows.length === 0 ? (
          <AdminListEmpty>No colors yet.</AdminListEmpty>
        ) : (
          <TableContainer>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={ADMIN_TABLE_HEAD}>
                  <th className={cn(adminThEnd(), "w-10 px-2")} aria-label="Swatch" />
                  <th className={adminTh()}>Name</th>
                  <th className={adminTh()}>Hex</th>
                  <th className={adminTh()}>RGB</th>
                  <th className={adminTh()}>Sort</th>
                  <th className={adminTh()}>Active</th>
                  <th className={adminThEnd()} />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className={ADMIN_TABLE_ROW}>
                    <td className={adminTd("w-10 px-2")}>
                      <SwatchPreview color={c} />
                    </td>
                    <td className={adminTd("font-medium")}>{c.name}</td>
                    <td className={adminTd("font-mono text-xs text-muted-foreground")}>{c.hex ?? "—"}</td>
                    <td className={adminTd("max-w-[140px] truncate font-mono text-xs text-muted-foreground")}>
                      {c.rgb ?? "—"}
                    </td>
                    <td className={adminTd("tabular-nums text-muted-foreground")}>{c.sort_order}</td>
                    <td className={adminTd()}>
                      {c.is_active ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : (
                        <Badge variant="outline">Off</Badge>
                      )}
                    </td>
                    <td className={adminTd("text-right")}>
                      <AdminRowEditLink to={`/dashboard/colors/${c.id}`} />
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
