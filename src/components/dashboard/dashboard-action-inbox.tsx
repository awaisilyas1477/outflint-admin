import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, MessageSquare, Package } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ADMIN_LIST_CARD_CLASS, ADMIN_LIST_CARD_HEADER_CLASS } from "@/components/dashboard/admin-list-shell";
import { fetchOpenOrdersAdmin } from "@/lib/supabase/orders";
import { fetchDashboardStats } from "@/lib/supabase/dashboard-stats";
import { countLowStockVariantsAdmin } from "@/lib/supabase/inventory-admin";
import { formatMinorUnits } from "@/lib/format-money";
import { formatOrderStatus, orderStatusVariant } from "@/lib/order-status";

export function DashboardActionInbox() {
  const [openOrders, setOpenOrders] = useState<Awaited<ReturnType<typeof fetchOpenOrdersAdmin>>>([]);
  const [pendingReviews, setPendingReviews] = useState(0);
  const [lowStock, setLowStock] = useState(0);

  useEffect(() => {
    void Promise.all([
      fetchOpenOrdersAdmin(6),
      fetchDashboardStats(),
      countLowStockVariantsAdmin(5),
    ]).then(([orders, stats, low]) => {
      setOpenOrders(orders);
      setPendingReviews(stats.pendingReviewCount ?? 0);
      setLowStock(low);
    });
  }, []);

  return (
    <Card className={ADMIN_LIST_CARD_CLASS}>
      <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
        <CardTitle>Action inbox</CardTitle>
        <CardDescription>Orders to fulfill, reviews to moderate, and stock to check.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <div className="flex flex-wrap gap-2">
          <Link
            to="/dashboard/orders?status=pending"
            className="inline-flex items-center rounded-md border border-border px-2.5 py-0.5 text-xs font-medium hover:bg-muted/40"
          >
            <ClipboardList className="mr-1 h-3 w-3" />
            {openOrders.length > 0 ? `${openOrders.length}+ open` : "Open orders"}
          </Link>
          <Link
            to="/dashboard/reviews"
            className="inline-flex items-center rounded-md border border-border px-2.5 py-0.5 text-xs font-medium hover:bg-muted/40"
          >
            <MessageSquare className="mr-1 h-3 w-3" />
            {pendingReviews} pending reviews
          </Link>
          <Link
            to="/dashboard/products"
            className="inline-flex items-center rounded-md border border-border px-2.5 py-0.5 text-xs font-medium hover:bg-muted/40"
          >
            <Package className="mr-1 h-3 w-3" />
            {lowStock} low-stock SKUs
          </Link>
        </div>

        {openOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open orders right now.</p>
        ) : (
          <ul className="space-y-2">
            {openOrders.map((o) => (
              <li key={o.id}>
                <Link
                  to={`/dashboard/orders/${o.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm hover:bg-muted/30"
                >
                  <span className="font-mono text-xs">{o.order_number ?? o.id.slice(0, 8)}</span>
                  <span className="truncate text-muted-foreground">
                    {[o.first_name, o.last_name].filter(Boolean).join(" ") || o.phone || o.email}
                  </span>
                  <Badge variant={orderStatusVariant(o.status)} className="capitalize">
                    {formatOrderStatus(o.status)}
                  </Badge>
                  <span className="tabular-nums font-medium">
                    {formatMinorUnits(o.total_cents, o.currency)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
