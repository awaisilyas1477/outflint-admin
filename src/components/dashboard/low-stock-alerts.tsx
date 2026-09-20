import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ADMIN_LIST_CARD_CLASS, ADMIN_LIST_CARD_HEADER_CLASS } from "@/components/dashboard/admin-list-shell";
import { fetchLowStockVariantsAdmin } from "@/lib/supabase/inventory-admin";

export function LowStockAlerts() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchLowStockVariantsAdmin>>>([]);

  useEffect(() => {
    void fetchLowStockVariantsAdmin(5, 8).then(setRows);
  }, []);

  return (
    <Card className={ADMIN_LIST_CARD_CLASS}>
      <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Low stock alerts
            </CardTitle>
            <CardDescription>Active products with 5 or fewer units on hand.</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/dashboard/products">Products</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-5">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No low-stock variants right now.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.variant_id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.product_name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{r.sku}</p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {r.quantity_on_hand} left
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
