import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ADMIN_MSG_CATALOG_UNAVAILABLE } from "@/lib/admin-user-messages";
import {
  ADMIN_LIST_PAGE_CLASS,
  AdminListSkeleton,
  TableContainer,
  ADMIN_TABLE_HEAD,
  ADMIN_TABLE_ROW,
  adminTh,
  adminThEnd,
  adminTd,
} from "@/components/dashboard/admin-list-shell";
import {
  fetchNewsletterCampaignById,
  fetchNewsletterCampaignRecipientsAdmin,
  type NewsletterCampaignRow,
  type NewsletterCampaignRecipientRow,
} from "@/lib/supabase/newsletter-campaigns-admin";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function NewsletterCampaignDetailPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [campaign, setCampaign] = useState<NewsletterCampaignRow | null>(null);
  const [recipients, setRecipients] = useState<NewsletterCampaignRecipientRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!campaignId) {
      setCampaign(null);
      setRecipients([]);
      setLoading(false);
      return;
    }
    if (!supabase) {
      toast.error(ADMIN_MSG_CATALOG_UNAVAILABLE);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [c, r] = await Promise.all([
        fetchNewsletterCampaignById(campaignId),
        fetchNewsletterCampaignRecipientsAdmin(campaignId),
      ]);
      setCampaign(c);
      setRecipients(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load campaign.");
      setCampaign(null);
      setRecipients([]);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  return (
    <div className={ADMIN_LIST_PAGE_CLASS}>
      <PageHeader
        title="Campaign detail"
        description="Exact send log for this broadcast."
        actions={
          <Link to="/dashboard/newsletter">
            <Button type="button" variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to newsletter
            </Button>
          </Link>
        }
      />

      {loading ? (
        <AdminListSkeleton rows={6} />
      ) : !campaign ? (
        <p className="text-sm text-muted-foreground">Campaign not found.</p>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{campaign.subject}</CardTitle>
              <CardDescription className="space-y-1 font-mono text-xs">
                <span className="block">ID: {campaign.id}</span>
                <span className="block">
                  Started: {campaign.created_at ? new Date(campaign.created_at).toLocaleString() : "—"}
                </span>
                {campaign.completed_at ? (
                  <span className="block">
                    Completed: {new Date(campaign.completed_at).toLocaleString()}
                  </span>
                ) : null}
                <span className="block">
                  Totals: {campaign.recipient_count} recipient(s) · {campaign.sent_ok} ok ·{" "}
                  {campaign.sent_failed} failed
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm font-medium text-foreground">Message preview</p>
              <div
                className="max-h-[min(480px,55vh)] overflow-auto rounded-lg border border-border/70 bg-background p-4 text-sm shadow-inner [&_a]:break-all [&_a]:text-primary [&_img]:max-w-full"
                dangerouslySetInnerHTML={{ __html: campaign.body_html }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recipients</CardTitle>
              <CardDescription>
                {recipients.length === 0
                  ? "No per-recipient rows (campaign may pre-date recipient logging, or send failed before logging)."
                  : `${recipients.length} row(s) for this campaign.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:p-6">
              {recipients.length === 0 ? null : (
                <TableContainer>
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className={ADMIN_TABLE_HEAD}>
                        <th className={adminTh()}>Email</th>
                        <th className={adminTh()}>Subscription</th>
                        <th className={adminTh()}>Status</th>
                        <th className={adminTh()}>Error</th>
                        <th className={adminThEnd()}>Logged</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipients.map((row) => (
                        <tr key={row.id} className={ADMIN_TABLE_ROW}>
                          <td className={adminTd()}>
                            <span className="font-medium text-foreground">{row.email}</span>
                          </td>
                          <td className={adminTd()}>
                            {row.subscription_id ? (
                              <span className="break-all font-mono text-xs text-muted-foreground">
                                {row.subscription_id}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className={adminTd()}>
                            {row.status === "sent" ? (
                              <Badge variant="outline" className="border-emerald-300 text-emerald-800">
                                Sent
                              </Badge>
                            ) : (
                              <Badge variant="destructive">Failed</Badge>
                            )}
                          </td>
                          <td className={cn(adminTd(), "max-w-xs text-xs text-muted-foreground")}>
                            {row.error_message ?? "—"}
                          </td>
                          <td className={cn(adminTd(), "whitespace-nowrap text-muted-foreground")}>
                            {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
