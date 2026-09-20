import { PageHeader } from "@/components/dashboard/page-header";
import { AnnouncementBarEditor } from "@/components/dashboard/announcement-bar-editor";
import { ADMIN_DASHBOARD_MAX_CLASS } from "@/components/dashboard/admin-list-shell";
import { cn } from "@/lib/utils";

export function AnnouncementPage() {
  return (
    <div className={cn(ADMIN_DASHBOARD_MAX_CLASS, "space-y-8")}>
      <PageHeader
        title="Announcement"
        description="Configure the rotating announcement bar above the storefront header."
      />
      <AnnouncementBarEditor />
    </div>
  );
}
