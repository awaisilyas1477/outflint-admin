import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ADMIN_LIST_CARD_CLASS, ADMIN_LIST_CARD_HEADER_CLASS } from "@/components/dashboard/admin-list-shell";
import { ChartContainer } from "@/components/dashboard/chart-container";
import { fetchOrderStatusCounts } from "@/lib/supabase/dashboard-stats";
import { formatOrderStatus } from "@/lib/order-status";
import { cn } from "@/lib/utils";

export function DistributionChart() {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchOrderStatusCounts>>>([]);

  useEffect(() => {
    void fetchOrderStatusCounts().then(setData);
  }, []);

  const chartData = data.map((d) => ({
    name: formatOrderStatus(d.status),
    count: d.count,
  }));

  return (
    <Card className={cn(ADMIN_LIST_CARD_CLASS, "min-h-[320px]")}>
      <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
        <CardTitle>Orders by status</CardTitle>
        <CardDescription>Live breakdown from all orders in the database.</CardDescription>
      </CardHeader>
      <CardContent className="w-full min-w-0 overflow-hidden pl-0">
        <ChartContainer>
          {({ width, height }) => (
            <BarChart
              width={width}
              height={height}
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval={0}
                angle={-12}
                textAnchor="end"
                height={56}
              />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--popover))",
                }}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="Orders" />
            </BarChart>
          )}
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
