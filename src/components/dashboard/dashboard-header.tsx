import { Fragment } from "react";
import { useLocation } from "react-router-dom";
import { mainNavItems } from "@/config/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { MobileSidebarTrigger } from "@/components/dashboard/app-sidebar";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { UserNav } from "@/components/dashboard/user-nav";

function titleForPath(path: string): string {
  const nav = mainNavItems.find((n) => n.url === path);
  if (nav) return nav.title;
  const seg = path.split("/").filter(Boolean).pop();
  if (seg) {
    return seg.charAt(0).toUpperCase() + seg.slice(1);
  }
  return "Admin";
}

type DashboardHeaderProps = {
  onOpenMobileNav: () => void;
};

export function DashboardHeader({ onOpenMobileNav }: DashboardHeaderProps) {
  const location = useLocation();
  const path = location.pathname;
  const segments = path.split("/").filter(Boolean);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-background px-4 md:px-6">
      <MobileSidebarTrigger onClick={onOpenMobileNav} />
      <Separator orientation="vertical" className="hidden h-6 md:block" />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList>
          {segments.map((_, i) => {
            const href = `/${segments.slice(0, i + 1).join("/")}`;
            const isLast = i === segments.length - 1;
            const label = titleForPath(href);
            return (
              <Fragment key={href}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage>{label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink to={href}>{label}</BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex items-center gap-1 sm:gap-2">
        <CommandPalette />
        <ThemeToggle />
        <UserNav />
      </div>
    </header>
  );
}
