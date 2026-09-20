import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ADMIN_LIST_CARD_CLASS,
  ADMIN_LIST_CARD_HEADER_CLASS,
  ADMIN_LIST_CARD_CONTENT_CLASS,
} from "@/components/dashboard/admin-list-shell";
import { fetchBestSellers30d, type BestSellerRow } from "@/lib/supabase/dashboard-stats";
import { formatMinorUnits } from "@/lib/format-money";

export function BestSellersTable() {
  const [rows, setRows] = useState<BestSellerRow[]>([]);

  useEffect(() => {
    void fetchBestSellers30d(10).then(setRows);
  }, []);

  return (
    <Card className={ADMIN_LIST_CARD_CLASS}>
      <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
        <CardTitle>Best sellers (30 days)</CardTitle>
        <CardDescription>By units sold — excl. cancelled and refunded orders.</CardDescription>
      </CardHeader>
      <CardContent className={ADMIN_LIST_CARD_CONTENT_CLASS}>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sales data in the last 30 days.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-border/70 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-3 font-semibold">Product</th>
                  <th className="pb-2 pr-3 font-semibold">SKU</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Units</th>
                  <th className="pb-2 text-right font-semibold">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.sku} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-3 font-medium">{r.product_name}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{r.sku}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.units_sold}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatMinorUnits(r.revenue_cents, "PKR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          <Link to="/dashboard/products" className="text-primary hover:underline">
            Manage catalog →
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
