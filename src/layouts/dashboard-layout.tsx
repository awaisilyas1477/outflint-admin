import { useState } from "react";
import { Outlet } from "react-router-dom";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";

export function DashboardLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_100%_50%_at_50%_-10%,hsl(var(--primary)/0.05),transparent)]"
        aria-hidden
      />
      <AppSidebar
        mobileOpen={mobileNavOpen}
        onMobileOpenChange={setMobileNavOpen}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="min-w-0 flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-[100rem] px-4 pb-16 pt-6 md:px-8 md:pb-20 md:pt-8 lg:px-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
