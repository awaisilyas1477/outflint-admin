import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/dashboard/page-header";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { AdminStandardDialogContent } from "@/components/ui/admin-standard-dialog";
import { toast } from "sonner";
import { ADMIN_MSG_CATALOG_UNAVAILABLE } from "@/lib/admin-user-messages";
import {
  AdminListCard,
  AdminListSkeleton,
  AdminListEmpty,
  ADMIN_LIST_PAGE_CLASS,
  TableContainer,
  ADMIN_TABLE_HEAD,
  ADMIN_TABLE_ROW,
  adminTh,
  adminThEnd,
  adminTd,
} from "@/components/dashboard/admin-list-shell";
import {
  deleteContactInquiryAdmin,
  fetchContactInquiriesAdmin,
  type ContactInquiryRow,
} from "@/lib/supabase/contact-inquiries-admin";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

function snippet(text: string, max = 80): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function ContactInquiriesListPage() {
  const [rows, setRows] = useState<ContactInquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ContactInquiryRow | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) {
      toast.error(ADMIN_MSG_CATALOG_UNAVAILABLE);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchContactInquiriesAdmin(300);
      setRows(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load contact inquiries.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      return (
        r.from_name.toLowerCase().includes(q) ||
        r.from_email.toLowerCase().includes(q) ||
        r.message.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    });
  }, [rows, query]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusyDelete(true);
    try {
      await deleteContactInquiryAdmin(pendingDelete.id, pendingDelete.image_urls);
      toast.success("Inquiry deleted.");
      setPendingDelete(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusyDelete(false);
    }
  }

  return (
    <div className={ADMIN_LIST_PAGE_CLASS}>
      <PageHeader
        title="Contact inquiries"
        description="Messages from the storefront contact form, including optional screenshots. Open a row for the full message and images."
      />

      <AdminListCard
        title="Inbox"
        description="Newest first. Delivery status reflects your email provider when each inquiry was sent."
        headerRight={
          <div className="relative w-full min-w-[min(100%,16rem)] sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Filter by name, email, message…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 pl-9"
              aria-label="Filter inquiries"
            />
          </div>
        }
      >
        <Dialog open={pendingDelete !== null} onOpenChange={(o) => !o && !busyDelete && setPendingDelete(null)}>
          <AdminStandardDialogContent
            title="Delete this inquiry?"
            subtitle={
              pendingDelete
                ? `Remove the saved message from ${pendingDelete.from_name} and delete any attached images from storage. This cannot be undone.`
                : undefined
            }
            footer={
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busyDelete}
                  onClick={() => setPendingDelete(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busyDelete}
                  onClick={() => void confirmDelete()}
                >
                  {busyDelete ? "Deleting…" : "Delete"}
                </Button>
              </DialogFooter>
            }
          />
        </Dialog>

        {loading ? (
          <AdminListSkeleton rows={6} />
        ) : filtered.length === 0 ? (
          <AdminListEmpty>
            {rows.length === 0 ? "No contact inquiries yet." : "No matches for your search."}
          </AdminListEmpty>
        ) : (
          <TableContainer>
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className={ADMIN_TABLE_HEAD}>
                  <th className={adminTh()}>Received</th>
                  <th className={adminTh()}>From</th>
                  <th className={adminTh()}>Message</th>
                  <th className={adminTh()}>Images</th>
                  <th className={adminTh()}>Email</th>
                  <th className={adminThEnd()}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className={ADMIN_TABLE_ROW}>
                    <td className={adminTd()}>
                      <span className="whitespace-nowrap text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </span>
                    </td>
                    <td className={adminTd()}>
                      <div className="font-medium text-foreground">{r.from_name}</div>
                      <div className="text-xs text-muted-foreground">{r.from_email}</div>
                    </td>
                    <td className={cn(adminTd(), "max-w-56")}>
                      <span className="line-clamp-2 text-muted-foreground">{snippet(r.message)}</span>
                    </td>
                    <td className={adminTd()}>
                      {r.image_urls.length > 0 ? (
                        <Badge variant="secondary">{r.image_urls.length}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={adminTd()}>
                      {r.email_sent ? (
                        <Badge variant="outline" className="border-emerald-300 text-emerald-800">
                          Sent
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Failed</Badge>
                      )}
                    </td>
                    <td className={adminThEnd()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/dashboard/contact-inquiries/${r.id}`}>View</Link>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          aria-label={`Delete inquiry from ${r.from_name}`}
                          onClick={() => setPendingDelete(r)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableContainer>
        )}
      </AdminListCard>
    </div>
  );
}
