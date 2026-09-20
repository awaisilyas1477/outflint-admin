import { FOOTER_DASHBOARD_BASE } from "@/config/footer-dashboard";
import {
  LayoutDashboard,
  LayoutGrid,
  LayoutTemplate,
  LineChart,
  Settings,
  Package,
  Layers,
  Ruler,
  Palette,
  Tag,
  TicketPercent,
  ClipboardList,
  MessageSquare,
  Heart,
  Users,
  Megaphone,
  Truck,
  Menu,
  Mail,
  Newspaper,
  Send,
  Scale,
  Search,
  ShoppingCart,
  ScrollText,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
};

export type NavGroup = {
  id: string;
  label: string;
  /** When true, sidebar shows this group as an accordion with nested links */
  collapsible?: boolean;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "Analytics", url: "/dashboard/analytics", icon: LineChart },
    ],
  },
  {
    id: "store-configuration",
    label: "Store configuration",
    collapsible: true,
    items: [
      { title: "Hero section", url: "/dashboard/hero", icon: LayoutTemplate },
      { title: "Announcement", url: "/dashboard/announcement", icon: Megaphone },
      { title: "Home sections", url: "/dashboard/home-sections", icon: LayoutGrid },
      { title: "Delivery", url: "/dashboard/delivery", icon: Truck },
      { title: "Header menu", url: "/dashboard/header-menu", icon: Menu },
      { title: "Footer", url: FOOTER_DASHBOARD_BASE, icon: Scale },
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    items: [
      { title: "Collections", url: "/dashboard/collections", icon: Layers },
      { title: "Products", url: "/dashboard/products", icon: Package },
      { title: "Sizes", url: "/dashboard/sizes", icon: Ruler },
      { title: "Colors", url: "/dashboard/colors", icon: Palette },
      { title: "Tags", url: "/dashboard/tags", icon: Tag },
    ],
  },
  {
    id: "commerce",
    label: "Commerce",
    items: [
      { title: "Orders", url: "/dashboard/orders", icon: ClipboardList },
      { title: "Abandoned carts", url: "/dashboard/abandoned-carts", icon: ShoppingCart },
      { title: "Customers", url: "/dashboard/customers", icon: Users },
      { title: "Vouchers", url: "/dashboard/vouchers", icon: TicketPercent },
      { title: "Reviews", url: "/dashboard/reviews", icon: MessageSquare },
      { title: "Contact inquiries", url: "/dashboard/contact-inquiries", icon: Mail },
      { title: "Newsletter", url: "/dashboard/newsletter", icon: Newspaper },
      { title: "Newsletter send", url: "/dashboard/newsletter/send", icon: Send },
      { title: "Wishlist", url: "/dashboard/wishlist", icon: Heart },
    ],
  },
  {
    id: "system",
    label: "Workspace",
    items: [
      { title: "SEO", url: "/dashboard/seo", icon: Search },
      { title: "Audit log", url: "/dashboard/audit-log", icon: ScrollText },
      { title: "Settings", url: "/dashboard/settings", icon: Settings },
    ],
  },
];

/** Flat list for breadcrumbs, command palette fallbacks, and legacy imports */
export const mainNavItems: NavItem[] = navGroups.flatMap((g) => g.items);
