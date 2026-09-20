import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  LayoutGrid,
  LayoutTemplate,
  LineChart,
  Settings,
  Search,
  User,
  Package,
  Layers,
  Ruler,
  Palette,
  Tag,
  ClipboardList,
  MessageSquare,
  TicketPercent,
  Users,
  Heart,
  Megaphone,
  Truck,
  Mail,
  Newspaper,
  Send,
  Scale,
} from "lucide-react";
import { FOOTER_DASHBOARD_BASE } from "@/config/footer-dashboard";
import { navGroups } from "@/config/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

const iconMap = {
  "/dashboard": LayoutDashboard,
  "/dashboard/hero": LayoutTemplate,
  "/dashboard/announcement": Megaphone,
  "/dashboard/home-sections": LayoutGrid,
  "/dashboard/delivery": Truck,
  [FOOTER_DASHBOARD_BASE]: Scale,
  "/dashboard/analytics": LineChart,
  "/dashboard/products": Package,
  "/dashboard/orders": ClipboardList,
  "/dashboard/customers": Users,
  "/dashboard/sizes": Ruler,
  "/dashboard/colors": Palette,
  "/dashboard/tags": Tag,
  "/dashboard/collections": Layers,
  "/dashboard/vouchers": TicketPercent,
  "/dashboard/reviews": MessageSquare,
  "/dashboard/contact-inquiries": Mail,
  "/dashboard/newsletter": Newspaper,
  "/dashboard/newsletter/send": Send,
  "/dashboard/wishlist": Heart,
  "/dashboard/settings": Settings,
} as const;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative hidden h-10 w-full max-w-sm items-center gap-2 rounded-lg border border-input/80 bg-muted/30 px-3 text-left text-sm text-muted-foreground shadow-sm transition-colors hover:bg-muted/50 sm:flex md:w-72"
      >
        <Search className="h-4 w-4 shrink-0 opacity-60" />
        <span className="flex-1 truncate">Search pages…</span>
        <kbd className="pointer-events-none hidden h-[22px] select-none items-center gap-1 rounded-md border border-border/80 bg-background px-2 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
          ⌘K
        </kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-input/80 bg-background shadow-sm sm:hidden"
        aria-label="Open command palette"
      >
        <Search className="h-4 w-4 text-muted-foreground" />
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Jump to page or action…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          {navGroups.map((group, gi) => (
            <div key={group.id}>
              {gi > 0 ? <CommandSeparator className="my-1" /> : null}
              <CommandGroup heading={group.label}>
                {group.items.map((item) => {
                  const Icon =
                    iconMap[item.url as keyof typeof iconMap] ?? LayoutDashboard;
                  return (
                    <CommandItem
                      key={item.url}
                      onSelect={() => {
                        navigate(item.url);
                        setOpen(false);
                      }}
                    >
                      <Icon className="h-4 w-4" />
                      {item.title}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </div>
          ))}
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem
              onSelect={() => {
                navigate("/dashboard/profile");
                setOpen(false);
              }}
            >
              <User className="h-4 w-4" />
              Profile
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
