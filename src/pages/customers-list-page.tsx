import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { AdminSearchField } from "@/components/dashboard/admin-search-field";
import { AdminPagination } from "@/components/dashboard/admin-pagination";
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
import { cn } from "@/lib/utils";
import {
  fetchCustomersAdminPaginated,
  fetchOrderCountByUserIds,
  type PublicUserRow,
} from "@/lib/supabase/customers";
import { supabase } from "@/lib/supabase/client";

const PAGE_SIZE = 25;

function displayName(u: PublicUserRow): string {
  const n = `${u.first_name} ${u.last_name}`.trim();
  return n || "—";
}

export function CustomersListPage() {
  const [rows, setRows] = useState<PublicUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [orderCounts, setOrderCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [searchDebounced]);

  const load = useCallback(async () => {
    if (!supabase) {
      toast.error(ADMIN_MSG_CATALOG_UNAVAILABLE);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await fetchCustomersAdminPaginated({
        page,
        pageSize: PAGE_SIZE,
        search: searchDebounced,
      });
      setRows(result.rows);
      setTotal(result.total);
      const ids = result.rows.map((r) => r.id);
      setOrderCounts(await fetchOrderCountByUserIds(ids));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load customers.");
    } finally {
      setLoading(false);
    }
  }, [page, searchDebounced]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  return (
    <div className={ADMIN_LIST_PAGE_CLASS}>
      <PageHeader
        title="Customers"
        description="Search by phone or name — paginated list for support lookups."
      />

      <AdminListCard
        title="Directory"
        description={`${total.toLocaleString()} customer profile${total === 1 ? "" : "s"}.`}
        headerRight={
          <div className="relative w-full min-w-[min(100%,16rem)] sm:w-72">
            <AdminSearchField
              value={query}
              onChange={setQuery}
              placeholder="Search phone, first or last name…"
              aria-label="Search customers"
            />
          </div>
        }
      >
        {loading ? (
          <AdminListSkeleton rows={5} />
        ) : rows.length === 0 ? (
          <AdminListEmpty icon={Users}>
            {searchDebounced ? "No customers match this search." : "No customer profiles yet."}
          </AdminListEmpty>
        ) : (
          <>
            <TableContainer>
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className={ADMIN_TABLE_HEAD}>
                    <th className={adminTh()}>Customer</th>
                    <th className={adminTh()}>Phone</th>
                    <th className={adminTh()}>Orders</th>
                    <th className={adminTh()}>Joined</th>
                    <th className={adminThEnd()} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id} className={ADMIN_TABLE_ROW}>
                      <td className={adminTd()}>
                        <span className="font-medium text-foreground">{displayName(u)}</span>
                        <span className="mt-0.5 block font-mono text-[0.65rem] text-muted-foreground">
                          {u.id.slice(0, 8)}…
                        </span>
                      </td>
                      <td className={adminTd("tabular-nums text-muted-foreground")}>
                        {u.phone?.trim() || "—"}
                      </td>
                      <td className={adminTd("tabular-nums")}>{orderCounts.get(u.id) ?? 0}</td>
                      <td className={adminTd("text-muted-foreground")}>
                        {new Date(u.created_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className={cn(adminTd(), "text-right")}>
                        <AdminRowEditLink to={`/dashboard/customers/${u.id}`}>View</AdminRowEditLink>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableContainer>
            <AdminPagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={setPage}
              className="mt-4"
            />
          </>
        )}
      </AdminListCard>
    </div>
  );
}
