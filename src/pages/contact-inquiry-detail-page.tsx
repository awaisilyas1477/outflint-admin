import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { AdminStandardDialogContent } from "@/components/ui/admin-standard-dialog";
import { toast } from "sonner";
import { ADMIN_MSG_CATALOG_UNAVAILABLE } from "@/lib/admin-user-messages";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ADMIN_LIST_PAGE_CLASS,
  ADMIN_LIST_CARD_CLASS,
  ADMIN_LIST_CARD_HEADER_CLASS,
  ADMIN_LIST_CARD_CONTENT_CLASS,
} from "@/components/dashboard/admin-list-shell";
import {
  deleteContactInquiryAdmin,
  fetchContactInquiryById,
  type ContactInquiryRow,
} from "@/lib/supabase/contact-inquiries-admin";
import { supabase } from "@/lib/supabase/client";

export function ContactInquiryDetailPage() {
  const { inquiryId } = useParams<{ inquiryId: string }>();
  const navigate = useNavigate();
  const [row, setRow] = useState<ContactInquiryRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);

  const load = useCallback(async () => {
    if (!inquiryId) {
      setRow(null);
      setLoading(false);
      return;
    }
    if (!supabase) {
      toast.error(ADMIN_MSG_CATALOG_UNAVAILABLE);
      setRow(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchContactInquiryById(inquiryId);
      setRow(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load inquiry.");
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [inquiryId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  async function confirmDelete() {
    if (!row) return;
    setBusyDelete(true);
    try {
      await deleteContactInquiryAdmin(row.id, row.image_urls);
      toast.success("Inquiry deleted.");
      setDeleteOpen(false);
      navigate("/dashboard/contact-inquiries", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusyDelete(false);
    }
  }

  if (loading) {
    return (
      <div className={ADMIN_LIST_PAGE_CLASS}>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (row === null) {
    return (
      <div className={ADMIN_LIST_PAGE_CLASS}>
        <PageHeader title="Not found" description="This contact inquiry does not exist or was removed." />
        <Button variant="outline" asChild>
          <Link to="/dashboard/contact-inquiries">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to list
          </Link>
        </Button>
      </div>
    );
  }

  const mailHref = `mailto:${encodeURIComponent(row.from_email)}?subject=${encodeURIComponent(`Re: Your message to us`)}`;

  return (
    <div className={ADMIN_LIST_PAGE_CLASS}>
      <Dialog open={deleteOpen} onOpenChange={(o) => !o && !busyDelete && setDeleteOpen(false)}>
        <AdminStandardDialogContent
          title="Delete this inquiry?"
          subtitle={`Remove this inquiry from ${row.from_name}${row.image_urls.length > 0 ? ` and delete ${row.image_urls.length} attached image(s) from storage` : ""}. This cannot be undone.`}
          footer={
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={busyDelete} onClick={() => setDeleteOpen(false)}>
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

      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
          <Link to="/dashboard/contact-inquiries">
            <ArrowLeft className="mr-1 h-4 w-4" />
            All inquiries
          </Link>
        </Button>
      </div>

      <PageHeader
        title={row.from_name}
        description={`${new Date(row.created_at).toLocaleString()} · ${row.from_email}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={mailHref}>
                Reply by email
                <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-70" />
              </a>
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        {row.email_sent ? (
          <Badge variant="outline" className="border-emerald-300 text-emerald-800">
            Notification email sent
          </Badge>
        ) : (
          <Badge variant="destructive">Notification email failed</Badge>
        )}
        {row.image_urls.length > 0 ? (
          <Badge variant="secondary">{row.image_urls.length} image(s) attached</Badge>
        ) : null}
      </div>

      {!row.email_sent && row.email_error ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <strong>Email error:</strong> {row.email_error}
        </p>
      ) : null}

      <Card className={`${ADMIN_LIST_CARD_CLASS} mt-6`}>
        <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
          <CardTitle className="text-base">Message</CardTitle>
          <CardDescription>What the customer wrote on the contact form.</CardDescription>
        </CardHeader>
        <CardContent className={ADMIN_LIST_CARD_CONTENT_CLASS}>
          <pre className="whitespace-pre-wrap wrap-break-word font-sans text-sm leading-relaxed text-foreground">
            {row.message}
          </pre>
        </CardContent>
      </Card>

      {row.image_urls.length > 0 ? (
        <Card className={`${ADMIN_LIST_CARD_CLASS} mt-6`}>
          <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
            <CardTitle className="text-base">Attachments</CardTitle>
            <CardDescription>Screenshots they uploaded (stored in Supabase Storage).</CardDescription>
          </CardHeader>
          <CardContent className={ADMIN_LIST_CARD_CONTENT_CLASS}>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {row.image_urls.map((url) => (
                <li key={url} className="overflow-hidden rounded-lg border border-border bg-muted/20">
                  <a href={url} target="_blank" rel="noopener noreferrer" className="block">
                    <img src={url} alt="Customer attachment" className="aspect-video w-full object-contain bg-black/5" />
                  </a>
                  <div className="border-t border-border px-2 py-1.5">
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Open full size
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
