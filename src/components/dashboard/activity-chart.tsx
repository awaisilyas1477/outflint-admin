import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ADMIN_LIST_CARD_CLASS, ADMIN_LIST_CARD_HEADER_CLASS } from "@/components/dashboard/admin-list-shell";
import { ChartContainer } from "@/components/dashboard/chart-container";
import { fetchDailyOrderStats } from "@/lib/supabase/dashboard-stats";
import { formatMinorUnits } from "@/lib/format-money";
import { cn } from "@/lib/utils";

export function ActivityChart() {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchDailyOrderStats>>>([]);

  useEffect(() => {
    void fetchDailyOrderStats(30).then(setData);
  }, []);

  const chartData = data.map((d) => ({
    t: d.date.slice(5),
    orders: d.orders,
    revenue: d.revenueCents / 100,
  }));

  return (
    <Card className={cn(ADMIN_LIST_CARD_CLASS, "min-h-[320px]")}>
      <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
        <CardTitle>Orders (30 days)</CardTitle>
        <CardDescription>Daily order count from your database.</CardDescription>
      </CardHeader>
      <CardContent className="w-full min-w-0 overflow-hidden pl-0">
        <ChartContainer>
          {({ width, height }) => (
            <AreaChart
              width={width}
              height={height}
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="fillOrders" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="t" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--popover))",
                }}
              />
              <Area
                type="monotone"
                dataKey="orders"
                name="Orders"
                stroke="hsl(var(--primary))"
                fill="url(#fillOrders)"
                strokeWidth={2}
              />
            </AreaChart>
          )}
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export function RevenueChart() {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchDailyOrderStats>>>([]);

  useEffect(() => {
    void fetchDailyOrderStats(30).then(setData);
  }, []);

  const chartData = data.map((d) => ({
    t: d.date.slice(5),
    revenue: d.revenueCents / 100,
  }));

  return (
    <Card className={cn(ADMIN_LIST_CARD_CLASS, "min-h-[320px]")}>
      <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
        <CardTitle>Revenue (30 days)</CardTitle>
        <CardDescription>Daily revenue in PKR (excl. cancelled/refunded).</CardDescription>
      </CardHeader>
      <CardContent className="w-full min-w-0 overflow-hidden pl-0">
        <ChartContainer>
          {({ width, height }) => (
            <AreaChart
              width={width}
              height={height}
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="t" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
              <Tooltip
                formatter={(v) =>
                  formatMinorUnits(Math.round(Number(v ?? 0) * 100), "PKR")
                }
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--popover))",
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.15}
                strokeWidth={2}
              />
            </AreaChart>
          )}
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
