import { useLocation } from "react-router-dom";
import { mainNavItems } from "@/config/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  ADMIN_LIST_CARD_CLASS,
  ADMIN_LIST_CARD_HEADER_CLASS,
  ADMIN_LIST_CARD_CONTENT_CLASS,
  ADMIN_LIST_PAGE_CLASS,
} from "@/components/dashboard/admin-list-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PlaceholderPage() {
  const location = useLocation();
  const nav = mainNavItems.find((n) => n.url === location.pathname);
  const title = nav?.title ?? "Section";

  return (
    <div className={ADMIN_LIST_PAGE_CLASS}>
      <PageHeader
        title={title}
        description="This section is not wired yet — use it for future admin tools."
      />
      <Card className={ADMIN_LIST_CARD_CLASS}>
        <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>Reserved for upcoming features.</CardDescription>
        </CardHeader>
        <CardContent className={cn(ADMIN_LIST_CARD_CONTENT_CLASS, "text-sm text-muted-foreground")}>
          <p>When you add a new tool, route it here and replace this card with the real UI.</p>
        </CardContent>
      </Card>
    </div>
  );
}
