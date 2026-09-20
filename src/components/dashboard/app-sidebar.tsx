import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight, PanelLeft } from "lucide-react";
import { APP_LOGO_SRC, APP_MARK_SRC, APP_NAME, APP_TAGLINE } from "@/config/brand";
import { navGroups, type NavGroup, type NavItem } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function pathMatchesItem(pathname: string, item: NavItem): boolean {
  return (
    pathname === item.url ||
    (item.url !== "/dashboard" && pathname.startsWith(item.url))
  );
}

function groupHasActiveChild(group: NavGroup, pathname: string): boolean {
  return group.items.some((item) => pathMatchesItem(pathname, item));
}

/** Shared by static section titles and accordion triggers — matches catalog / overview headers. */
const NAV_SECTION_LABEL_CLASS =
  "text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/90";

type NavLinkProps = {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  isMobile: boolean;
  onNavigate?: () => void;
  /** Indented sub-nav (e.g. Store configuration); keeps icon + label rhythm aligned with top-level rows. */
  nested?: boolean;
};

function NavLinkRow({
  item,
  pathname,
  collapsed,
  isMobile,
  onNavigate,
  nested,
}: NavLinkProps) {
  const active = pathMatchesItem(pathname, item);
  const Icon = item.icon;
  /** Top-level: pill highlight. Sub-nav (Store configuration): text + icon emphasis only — no background box. */
  const activeTop = active && !nested;
  const activeNested = active && nested;
  const link = (
    <Link
      to={item.url}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-3 text-sm font-medium transition-colors duration-150",
        nested ? "px-3 py-2" : "rounded-lg px-3 py-2.5",
        activeTop &&
          "bg-primary/10 text-foreground shadow-sm ring-1 ring-primary/15 dark:bg-primary/15 dark:text-foreground",
        activeNested &&
          "bg-transparent text-foreground shadow-none ring-0 dark:bg-transparent",
        !active &&
          "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
        activeNested && "font-medium text-primary hover:bg-transparent",
        collapsed && !isMobile && "justify-center px-2",
      )}
    >
      <Icon
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-colors",
          activeTop || activeNested
            ? "text-primary"
            : "text-muted-foreground group-hover:text-foreground",
        )}
        aria-hidden
      />
      {(!collapsed || isMobile) && <span className="truncate">{item.title}</span>}
    </Link>
  );
  if (collapsed && !isMobile) {
    return (
      <Tooltip key={item.url} delayDuration={0}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="font-medium">
          {item.title}
        </TooltipContent>
      </Tooltip>
    );
  }
  return <div>{link}</div>;
}

type SidebarNavProps = {
  pathname: string;
  collapsed: boolean;
  isMobile: boolean;
  onNavigate?: () => void;
  onToggleCollapse: () => void;
};

function SidebarNav({
  pathname,
  collapsed,
  isMobile,
  onNavigate,
  onToggleCollapse,
}: SidebarNavProps) {
  const [accordionOpen, setAccordionOpen] = useState<Record<string, boolean>>({});

  return (
    <>
      <div
        className={cn(
          "flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border/80 px-4",
          collapsed && !isMobile && "justify-center px-2",
        )}
      >
        {collapsed && !isMobile ? (
          <img
            src={APP_MARK_SRC}
            alt={APP_NAME}
            className="h-9 w-9 shrink-0 object-contain dark:invert"
          />
        ) : (
          <div className="min-w-0 flex-1">
            <img
              src={APP_LOGO_SRC}
              alt={APP_NAME}
              className="h-8 w-auto max-w-full object-contain object-left dark:invert"
            />
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{APP_TAGLINE}</p>
          </div>
        )}
      </div>
      <ScrollArea className="flex-1 py-3 pl-4 pr-3">
        <nav className="flex flex-col gap-4" aria-label="Main">
          {navGroups.map((group) => {
            const isCollapsible = Boolean(group.collapsible);

            if (isCollapsible && collapsed && !isMobile) {
              return (
                <div key={group.id} className="flex flex-col gap-0.5">
                  {group.items.map((item) => (
                    <NavLinkRow
                      key={item.url}
                      item={item}
                      pathname={pathname}
                      collapsed={collapsed}
                      isMobile={isMobile}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              );
            }

            if (isCollapsible && (!collapsed || isMobile)) {
              const hasActive = groupHasActiveChild(group, pathname);
              const isOpen =
                hasActive || (accordionOpen[group.id] ?? false);
              return (
                <div key={group.id} className="flex flex-col">
                  {/* Same typography as Catalog; tight vertical rhythm; chevron is separate control. */}
                  <div
                    className={cn(
                      "flex items-center justify-between gap-2 px-3",
                      isOpen ? "mb-1" : "mb-0",
                    )}
                  >
                    <p className={cn(NAV_SECTION_LABEL_CLASS, "min-w-0 flex-1 truncate")}>
                      {group.label}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (hasActive) return;
                        setAccordionOpen((prev) => ({
                          ...prev,
                          [group.id]: !isOpen,
                        }));
                      }}
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground",
                        "hover:bg-sidebar-accent hover:text-sidebar-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      )}
                      aria-expanded={isOpen}
                      aria-label={isOpen ? `Collapse ${group.label}` : `Expand ${group.label}`}
                    >
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 transition-transform duration-200",
                          isOpen ? "rotate-0" : "-rotate-90",
                        )}
                        aria-hidden
                      />
                    </button>
                  </div>
                  {isOpen ? (
                    <div
                      className="mt-0.5 flex flex-col gap-px border-l border-sidebar-border/50 pl-3 ml-3"
                      role="group"
                      aria-label={group.label}
                    >
                      {group.items.map((item) => (
                        <NavLinkRow
                          key={item.url}
                          nested
                          item={item}
                          pathname={pathname}
                          collapsed={collapsed}
                          isMobile={isMobile}
                          onNavigate={onNavigate}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            }

            return (
              <div key={group.id}>
                {(!collapsed || isMobile) && (
                  <p className={cn(NAV_SECTION_LABEL_CLASS, "mb-1.5 px-3")}>{group.label}</p>
                )}
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => (
                    <NavLinkRow
                      key={item.url}
                      item={item}
                      pathname={pathname}
                      collapsed={collapsed}
                      isMobile={isMobile}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
      </ScrollArea>
      {!isMobile && (
        <div className="border-t border-sidebar-border p-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-full justify-center gap-2 text-muted-foreground hover:text-foreground"
            onClick={onToggleCollapse}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span className="text-xs font-medium">Collapse</span>
              </>
            )}
          </Button>
        </div>
      )}
    </>
  );
}

type AppSidebarProps = {
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
};

export function AppSidebar({ mobileOpen, onMobileOpenChange }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const isMobile = useIsMobile();

  const navProps: SidebarNavProps = {
    pathname: location.pathname,
    collapsed,
    isMobile,
    onToggleCollapse: () => setCollapsed((c) => !c),
  };

  if (isMobile) {
    return (
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <div className="flex h-full flex-col">
            <SidebarNav
              {...navProps}
              onNavigate={() => onMobileOpenChange(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      className={cn(
        "sticky top-0 z-30 hidden h-screen shrink-0 border-r border-sidebar-border bg-sidebar md:flex md:flex-col",
        collapsed ? "w-[4.5rem]" : "w-64",
      )}
    >
      <SidebarNav {...navProps} />
    </aside>
  );
}

export function MobileSidebarTrigger({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <Button
      variant="outline"
      size="icon"
      className="h-10 w-10 shrink-0 md:hidden"
      onClick={onClick}
      aria-label="Open menu"
    >
      <PanelLeft className="h-5 w-5" />
    </Button>
  );
}
