import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShoppingCart } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ADMIN_LIST_CARD_CLASS, ADMIN_LIST_CARD_HEADER_CLASS } from "@/components/dashboard/admin-list-shell";
import { fetchRecentOrdersForActivity, type RecentOrderLine } from "@/lib/supabase/dashboard-stats";
import { formatOrderStatus, orderStatusVariant } from "@/lib/order-status";
import { formatMinorUnits } from "@/lib/format-money";
import { cn } from "@/lib/utils";

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function RecentActivity() {
  const [lines, setLines] = useState<RecentOrderLine[]>([]);

  useEffect(() => {
    void fetchRecentOrdersForActivity(8).then(setLines);
  }, []);

  return (
    <Card className={ADMIN_LIST_CARD_CLASS}>
      <CardHeader className={cn(ADMIN_LIST_CARD_HEADER_CLASS, "flex flex-row items-start justify-between gap-4")}>
        <div>
          <CardTitle>Recent orders</CardTitle>
          <CardDescription>Newest checkouts — open Orders for full fulfillment tools.</CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/dashboard/orders">
            View all
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="pt-6">
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders yet, or still loading.</p>
        ) : (
          <ul className="space-y-3">
            {lines.map((e) => {
              const label = e.order_number ?? e.id.slice(0, 8);
              return (
                <li key={e.id}>
                  <Link
                    to={`/dashboard/orders/${e.id}`}
                    className="flex gap-3 rounded-lg border border-border/60 bg-card p-3 hover:bg-muted/30"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <ShoppingCart className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium leading-none">Order {label}</p>
                        <Badge variant={orderStatusVariant(e.status)} className="capitalize">
                          {formatOrderStatus(e.status)}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {e.email || "Guest"} · {formatMinorUnits(e.total_cents, e.currency)}
                      </p>
                    </div>
                    <span className="shrink-0 self-center text-xs text-muted-foreground">
                      {relTime(e.created_at)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
