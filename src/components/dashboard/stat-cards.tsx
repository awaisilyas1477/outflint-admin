import { useEffect, useState } from "react";
import { Headphones, Heart, Mail, Package, ShoppingCart, Store } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { fetchDashboardStats } from "@/lib/supabase/dashboard-stats";
function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString();
}

export function StatCards() {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof fetchDashboardStats>> | null>(
    null,
  );

  useEffect(() => {
    void fetchDashboardStats().then(setStats);
  }, []);

  const items = [
    {
      label: "Active listings",
      value: fmt(stats?.activeProductCount),
      delta: "Products status = active",
      icon: Package,
    },
    {
      label: "Open orders",
      value: fmt(stats?.openOrderCount),
      delta: "Pending → processing",
      icon: ShoppingCart,
    },
    {
      label: "Collections",
      value: fmt(stats?.collectionCount),
      delta: "Merchandising groups",
      icon: Store,
    },
    {
      label: "Reviews pending",
      value: fmt(stats?.pendingReviewCount),
      delta: "Moderation queue",
      icon: Headphones,
    },
    {
      label: "Wishlist saves",
      value: fmt(stats?.wishlistSaveCount),
      delta: "Storefront hearts + option demand",
      icon: Heart,
    },
    {
      label: "Restock queue",
      value: fmt(stats?.restockQueuePendingCount),
      delta: "Pending email jobs",
      icon: Mail,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {items.map((s) => {
        const Icon = s.icon;
        return (
          <Card
            key={s.label}
            className="group overflow-hidden border-border/70 bg-card shadow-sm"
          >
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div className="space-y-1">
                <span className="text-sm font-medium text-muted-foreground">{s.label}</span>
                <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                  {s.value}
                </p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs leading-snug text-muted-foreground">{s.delta}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
