import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Copy, Download, MessageCircle, Package, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/dashboard/page-header";
import { AdminSearchField } from "@/components/dashboard/admin-search-field";
import { AdminConfirmDeleteDialog } from "@/components/dashboard/admin-confirm-delete-dialog";
import { AdminPagination } from "@/components/dashboard/admin-pagination";
import { toast } from "sonner";
import { ADMIN_MSG_CATALOG_UNAVAILABLE } from "@/lib/admin-user-messages";
import {
  AdminListCard,
  AdminListSkeleton,
  AdminListEmpty,
  AdminFilterBar,
  ADMIN_LIST_PAGE_CLASS,
  TableContainer,
  ADMIN_TABLE_HEAD,
  ADMIN_TABLE_ROW,
  adminTh,
  adminThEnd,
  adminTd,
  AdminRowActions,
} from "@/components/dashboard/admin-list-shell";
import {
  deleteOrderAdmin,
  fetchOrderDeskStats,
  fetchOrdersAdminForExport,
  fetchOrdersAdminPaginated,
  type OrderDateRange,
  type OrderDeskStats,
  type OrderRow,
  type OrderStatus,
} from "@/lib/supabase/orders";
import { exportOrdersCsv } from "@/lib/orders-csv-export";
import {
  deriveFulfillmentLane,
  derivePaymentLane,
  formatPaymentMethod,
  FULFILLMENT_LANE_LABELS,
  fulfillmentLaneVariant,
  PAYMENT_LANE_LABELS,
  paymentLaneVariant,
} from "@/lib/order-lanes";
import { formatMinorUnits } from "@/lib/format-money";
import { supabase } from "@/lib/supabase/client";
import {
  loadOrdersListPrefs,
  saveOrdersListPrefs,
} from "@/lib/admin-orders-prefs";
import { copyTextToClipboard, formatOrderListCopyText, formatOrderWhatsAppConfirmation } from "@/lib/order-dispatch";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

const PAGE_SIZE = 25;

const STATUS_FILTER: Array<{ value: OrderStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "paid", label: "Paid" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

const DATE_FILTER: Array<{ value: OrderDateRange; label: string }> = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "Last 30 days" },
];

const DELIVERED_LIKE: OrderStatus[] = ["delivered", "shipped"];

const EMPTY_STATS: OrderDeskStats = {
  total: 0,
  open: 0,
  unfulfilled: 0,
  processing: 0,
  shipped: 0,
  delivered: 0,
  issues: 0,
};

function parseStatusParam(raw: string | null): OrderStatus | "all" {
  if (!raw) return "all";
  const hit = STATUS_FILTER.find((f) => f.value === raw);
  return hit ? hit.value : "all";
}

function formatPlacedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function customerName(o: OrderRow): string {
  return [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email || "—";
}

export function OrdersListPage() {
  const [searchParams] = useSearchParams();
  const initialPrefs = loadOrdersListPrefs();
  const statusFromUrl = useMemo(
    () => parseStatusParam(searchParams.get("status")),
    [searchParams],
  );
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<OrderDeskStats>(EMPTY_STATS);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filter, setFilter] = useState<OrderStatus | "all">(
    statusFromUrl !== "all" ? statusFromUrl : initialPrefs.status,
  );
  const [dateRange, setDateRange] = useState<OrderDateRange>(initialPrefs.dateRange);
  const [query, setQuery] = useState(initialPrefs.search);
  const [searchDebounced, setSearchDebounced] = useState(initialPrefs.search);
  const [pendingDelete, setPendingDelete] = useState<OrderRow | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  useEffect(() => {
    if (statusFromUrl !== "all") setFilter(statusFromUrl);
  }, [statusFromUrl]);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [filter, searchDebounced, dateRange]);

  const load = useCallback(async () => {
    if (!supabase) {
      toast.error(ADMIN_MSG_CATALOG_UNAVAILABLE);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [result, desk] = await Promise.all([
        fetchOrdersAdminPaginated({
          page,
          pageSize: PAGE_SIZE,
          status: filter,
          search: searchDebounced,
          dateRange,
        }),
        fetchOrderDeskStats(dateRange),
      ]);
      setRows(result.rows);
      setTotal(result.total);
      setStats(desk);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load orders.");
    } finally {
      setLoading(false);
    }
  }, [page, filter, searchDebounced, dateRange]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusyDelete(true);
    const res = await deleteOrderAdmin(pendingDelete.id);
    setBusyDelete(false);
    if (!res.ok) {
      toast.error(res.error ?? "Delete failed.");
      return;
    }
    toast.success(
      res.stockRestored ? "Order deleted — stock restored to inventory." : "Order deleted.",
    );
    setPendingDelete(null);
    await load();
  }

  async function exportCsv() {
    saveOrdersListPrefs({ status: filter, dateRange, search: searchDebounced });
    setExporting(true);
    try {
      const data = await fetchOrdersAdminForExport({
        status: filter,
        search: searchDebounced,
        dateRange,
      });
      if (data.length === 0) {
        toast.error("No orders to export.");
        return;
      }
      exportOrdersCsv(data);
      toast.success(`Exported ${data.length} orders.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  async function copyOrderRow(o: OrderRow) {
    const ok = await copyTextToClipboard(formatOrderListCopyText(o));
    toast[ok ? "success" : "error"](ok ? "Copied to clipboard." : "Copy failed.");
  }

  function whatsAppOrder(o: OrderRow) {
    const url = buildWhatsAppUrl(o.phone, formatOrderWhatsAppConfirmation(o));
    if (!url) {
      toast.error("No valid phone on this order.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const isRiskyDelete =
    pendingDelete != null && DELIVERED_LIKE.includes(pendingDelete.status);

  const deskStats: Array<{
    key: string;
    label: string;
    value: number;
    hint: string;
    onClick: () => void;
    active: boolean;
  }> = [
    {
      key: "total",
      label: "Total",
      value: stats.total,
      hint: "In date range",
      onClick: () => setFilter("all"),
      active: filter === "all",
    },
    {
      key: "open",
      label: "Open",
      value: stats.open,
      hint: "Pending → processing",
      onClick: () => setFilter("pending"),
      active: filter === "pending" || filter === "confirmed" || filter === "paid",
    },
    {
      key: "unfulfilled",
      label: "Unfulfilled",
      value: stats.unfulfilled,
      hint: "Not yet packing",
      onClick: () => setFilter("confirmed"),
      active: filter === "confirmed",
    },
    {
      key: "processing",
      label: "Processing",
      value: stats.processing,
      hint: "In warehouse",
      onClick: () => setFilter("processing"),
      active: filter === "processing",
    },
    {
      key: "shipped",
      label: "Shipped",
      value: stats.shipped,
      hint: "With courier",
      onClick: () => setFilter("shipped"),
      active: filter === "shipped",
    },
    {
      key: "delivered",
      label: "Delivered",
      value: stats.delivered,
      hint: "Completed",
      onClick: () => setFilter("delivered"),
      active: filter === "delivered",
    },
    {
      key: "issues",
      label: "Issues",
      value: stats.issues,
      hint: "Cancelled / refunded",
      onClick: () => setFilter("cancelled"),
      active: filter === "cancelled" || filter === "refunded",
    },
  ];

  return (
    <div className={ADMIN_LIST_PAGE_CLASS}>
      <PageHeader
        title="Orders"
        description="Fulfillment desk — filter, search, copy for courier, WhatsApp, and CSV export."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={() => void exportCsv()}
          >
            <Download className="mr-2 h-4 w-4" />
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {deskStats.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={s.onClick}
            className={cn(
              "rounded-lg border px-3 py-2.5 text-left transition-colors",
              s.active
                ? "border-primary/40 bg-primary/5 shadow-sm"
                : "border-border/70 bg-card hover:border-border hover:bg-muted/30",
            )}
          >
            <p className="text-[11px] font-medium text-muted-foreground">{s.label}</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums tracking-tight">
              {s.value.toLocaleString()}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{s.hint}</p>
          </button>
        ))}
      </div>

      <AdminListCard
        title="Order desk"
        description={
          <>
            <span className="font-medium text-foreground tabular-nums">
              {total.toLocaleString()}
            </span>{" "}
            matching current filters
          </>
        }
      >
        <div className="mb-4 space-y-2.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <AdminFilterBar className="w-max max-w-full flex-nowrap overflow-x-auto">
              {STATUS_FILTER.map((f) => (
                <Button
                  key={f.value}
                  type="button"
                  size="sm"
                  variant={filter === f.value ? "default" : "ghost"}
                  className={cn(
                    "h-7 shrink-0 rounded-md px-2.5",
                    filter === f.value
                      ? "shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setFilter(f.value)}
                >
                  {f.label}
                </Button>
              ))}
            </AdminFilterBar>
            <NativeSelect
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as OrderDateRange)}
              className="h-8 w-full shrink-0 text-sm sm:w-40"
              aria-label="Date range"
            >
              {DATE_FILTER.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <AdminSearchField
            value={query}
            onChange={setQuery}
            placeholder="Search order #, phone, city, email…"
            aria-label="Search orders"
            className="max-w-md"
            inputClassName="h-9"
          />
        </div>

        <AdminConfirmDeleteDialog
          open={pendingDelete !== null}
          onOpenChange={(o) => !o && !busyDelete && setPendingDelete(null)}
          title={isRiskyDelete ? "Delete shipped/delivered order?" : "Delete this order?"}
          subtitle={
            pendingDelete ? (
              <>
                {isRiskyDelete ? (
                  <span className="mb-2 block font-medium text-destructive">
                    This order was already shipped or delivered — delete only for test/cleanup.
                  </span>
                ) : null}
                Order{" "}
                <span className="font-mono font-medium text-foreground">
                  {pendingDelete.order_number ?? pendingDelete.id.slice(0, 8)}
                </span>{" "}
                and all line items will be removed permanently. Stock will be restored to inventory.
              </>
            ) : undefined
          }
          busy={busyDelete}
          onConfirm={() => void confirmDelete()}
        />

        {loading ? (
          <AdminListSkeleton rows={5} />
        ) : rows.length === 0 ? (
          <AdminListEmpty icon={Package}>No orders match this filter.</AdminListEmpty>
        ) : (
          <>
            <TableContainer>
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead>
                  <tr className={ADMIN_TABLE_HEAD}>
                    <th className={adminTh()}>Order</th>
                    <th className={adminTh()}>Date</th>
                    <th className={adminTh()}>Customer</th>
                    <th className={adminTh()}>Destination</th>
                    <th className={adminTh()}>Payment</th>
                    <th className={adminTh()}>Fulfillment</th>
                    <th className={adminTh()}>Total</th>
                    <th className={adminThEnd()}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => {
                    const pay = derivePaymentLane(o.status, o.payment_method);
                    const fulfill = deriveFulfillmentLane(o.status);
                    const ref = o.order_number ?? o.id.slice(0, 8);
                    return (
                      <tr key={o.id} className={ADMIN_TABLE_ROW}>
                        <td className={adminTd()}>
                          <Link
                            to={`/dashboard/orders/${o.id}`}
                            className="font-mono text-xs font-semibold text-primary hover:underline"
                          >
                            #{ref}
                          </Link>
                          {o.customer_note ? (
                            <span className="mt-0.5 block text-[10px] text-muted-foreground">
                              Has note
                            </span>
                          ) : null}
                        </td>
                        <td className={adminTd("whitespace-nowrap text-xs text-muted-foreground")}>
                          {formatPlacedAt(o.created_at)}
                        </td>
                        <td className={adminTd()}>
                          <span
                            className="block max-w-[200px] truncate font-medium"
                            title={o.email}
                          >
                            {customerName(o)}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            {o.phone ? <span>{o.phone}</span> : null}
                            {!o.user_id ? (
                              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">
                                Guest
                              </Badge>
                            ) : null}
                          </span>
                        </td>
                        <td className={adminTd("text-muted-foreground")}>
                          <span className="block max-w-[160px] truncate">
                            {o.shipping_city || "—"}
                          </span>
                          {o.shipping_province ? (
                            <span className="mt-0.5 block text-xs text-muted-foreground/80">
                              {o.shipping_province}
                            </span>
                          ) : null}
                        </td>
                        <td className={adminTd()}>
                          <Badge variant={paymentLaneVariant(pay)} className="font-medium">
                            {PAYMENT_LANE_LABELS[pay]}
                          </Badge>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {formatPaymentMethod(o.payment_method)}
                          </span>
                        </td>
                        <td className={adminTd()}>
                          <Badge variant={fulfillmentLaneVariant(fulfill)} className="font-medium">
                            {FULFILLMENT_LANE_LABELS[fulfill]}
                          </Badge>
                        </td>
                        <td className={adminTd("tabular-nums font-semibold")}>
                          {formatMinorUnits(o.total_cents, o.currency)}
                        </td>
                        <td className={cn(adminTd(), "whitespace-nowrap")}>
                          <AdminRowActions>
                            <Button variant="ghost" size="sm" className="font-medium text-primary" asChild>
                              <Link to={`/dashboard/orders/${o.id}`}>Open</Link>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => void copyOrderRow(o)}
                              aria-label="Copy order summary"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => whatsAppOrder(o)}
                              aria-label="WhatsApp customer"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => setPendingDelete(o)}
                              aria-label={`Delete order ${ref}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AdminRowActions>
                        </td>
                      </tr>
                    );
                  })}
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
