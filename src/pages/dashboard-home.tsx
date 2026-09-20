import { Link } from "react-router-dom";
import { Package, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { ADMIN_DASHBOARD_MAX_CLASS } from "@/components/dashboard/admin-list-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StatCards } from "@/components/dashboard/stat-cards";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { DistributionChart } from "@/components/dashboard/distribution-chart";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { LowStockAlerts } from "@/components/dashboard/low-stock-alerts";
import { CatalogFeedHealth } from "@/components/dashboard/catalog-feed-health";
import { DashboardActionInbox } from "@/components/dashboard/dashboard-action-inbox";

export function DashboardHome() {
  return (
    <div className={cn(ADMIN_DASHBOARD_MAX_CLASS, "space-y-8")}>
      <PageHeader
        title="Dashboard"
        description="Store overview — orders, catalog health, and customer activity."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/dashboard/orders">
                <ShoppingCart className="mr-2 h-4 w-4" />
                Orders
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/dashboard/products">
                <Package className="mr-2 h-4 w-4" />
                Products
              </Link>
            </Button>
          </div>
        }
      />

      <StatCards />
      <DashboardActionInbox />
      <div className="grid min-h-0 min-w-0 gap-6 lg:grid-cols-2">
        <ActivityChart />
        <DistributionChart />
      </div>
      <div className="grid min-h-0 min-w-0 gap-6 lg:grid-cols-2">
        <LowStockAlerts />
        <CatalogFeedHealth />
      </div>
      <RecentActivity />
    </div>
  );
}
