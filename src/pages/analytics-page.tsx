import { useEffect, useId, useMemo, useState } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { ActivityChart, RevenueChart } from "@/components/dashboard/activity-chart";
import { DistributionChart } from "@/components/dashboard/distribution-chart";
import { BestSellersTable } from "@/components/dashboard/best-sellers-table";
import {
  ADMIN_LIST_CARD_CLASS,
  ADMIN_LIST_CARD_HEADER_CLASS,
  ADMIN_LIST_CARD_CONTENT_CLASS,
  ADMIN_LIST_PAGE_CLASS,
} from "@/components/dashboard/admin-list-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { fetchOrdersAggregatesSince } from "@/lib/supabase/dashboard-stats";
import { formatMinorUnits } from "@/lib/format-money";
import { fetchStoreSettings } from "@/lib/supabase/store-settings";

const RANGE_PRESETS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
] as const;

export function AnalyticsPage() {
  const rangeId = useId();
  const [range, setRange] = useState<(typeof RANGE_PRESETS)[number]["value"]>("30");
  const [currency, setCurrency] = useState("PKR");
  const [agg, setAgg] = useState({ orderCount: 0, revenueCents: 0, avgOrderCents: 0 });
  const [loading, setLoading] = useState(true);

  const sinceIso = useMemo(() => {
    const d = new Date();
    const days = range === "7" ? 7 : range === "90" ? 90 : 30;
    d.setDate(d.getDate() - days);
    return d.toISOString();
  }, [range]);

  useEffect(() => {
    void fetchStoreSettings().then(({ row: s }) => {
      if (s?.default_currency) setCurrency(s.default_currency);
    });
  }, []);

  useEffect(() => {
    queueMicrotask(() => setLoading(true));
    void fetchOrdersAggregatesSince(sinceIso).then((a) => {
      setAgg(a);
      setLoading(false);
    });
  }, [sinceIso]);

  const kpis = useMemo(
    () => [
      {
        label: "Orders",
        value: loading ? "…" : agg.orderCount.toLocaleString(),
        hint: `In selected window (excl. cancelled / refunded).`,
      },
      {
        label: "Revenue",
        value: loading
          ? "…"
          : formatMinorUnits(agg.revenueCents, currency),
        hint: "Sum of order totals (store currency).",
      },
      {
        label: "Avg. order",
        value: loading
          ? "…"
          : formatMinorUnits(agg.avgOrderCents, currency),
        hint: "Mean of order totals in range.",
      },
      {
        label: "Traffic",
        value: "—",
        hint: "Connect GA4 or Meta Pixel in storefront for session data.",
      },
    ],
    [agg, currency, loading],
  );

  return (
    <div className={ADMIN_LIST_PAGE_CLASS}>
      <PageHeader
        title="Analytics"
        description="Order economics and trends from your Supabase database. Traffic sessions require GA4 / Meta separately."
        actions={
          <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:min-w-[200px]">
            <Label htmlFor={rangeId}>Date range</Label>
            <select
              id={rangeId}
              value={range}
              onChange={(e) =>
                setRange(e.target.value as (typeof RANGE_PRESETS)[number]["value"])
              }
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {RANGE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className={ADMIN_LIST_CARD_CLASS}>
            <CardHeader className={cn(ADMIN_LIST_CARD_HEADER_CLASS, "pb-2")}>
              <CardDescription>{k.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{k.value}</CardTitle>
            </CardHeader>
            <CardContent className={cn(ADMIN_LIST_CARD_CONTENT_CLASS, "pt-0")}>
              <p className="text-xs text-muted-foreground">{k.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid min-h-0 min-w-0 gap-6 lg:grid-cols-2">
        <ActivityChart />
        <RevenueChart />
      </div>

      <DistributionChart />

      <BestSellersTable />
    </div>
  );
}
