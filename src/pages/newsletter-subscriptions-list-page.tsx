import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Search, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/dashboard/page-header";
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
  fetchNewsletterSubscriptionsAdmin,
  setNewsletterSubscribedAdmin,
  type NewsletterSubscriptionRow,
} from "@/lib/supabase/newsletter-subscriptions-admin";
import {
  fetchNewsletterCampaignsAdmin,
  type NewsletterCampaignRow,
} from "@/lib/supabase/newsletter-campaigns-admin";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function NewsletterSubscriptionsListPage() {
  const [rows, setRows] = useState<NewsletterSubscriptionRow[]>([]);
  const [campaigns, setCampaigns] = useState<NewsletterCampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "subscribed" | "unsubscribed">("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) {
      toast.error(ADMIN_MSG_CATALOG_UNAVAILABLE);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [subs, camps] = await Promise.all([
        fetchNewsletterSubscriptionsAdmin(800),
        fetchNewsletterCampaignsAdmin(80),
      ]);
      setRows(subs);
      setCampaigns(camps);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load newsletter data.");
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
    return rows.filter((r) => {
      if (statusFilter === "subscribed" && !r.subscribed) return false;
      if (statusFilter === "unsubscribed" && r.subscribed) return false;
      if (!q) return true;
      const uid = (r.user_id ?? "").toLowerCase();
      return (
        r.email.toLowerCase().includes(q) ||
        uid.includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    });
  }, [rows, query, statusFilter]);

  const campaignTotals = useMemo(() => {
    let ok = 0;
    let fail = 0;
    let recipients = 0;
    for (const c of campaigns) {
      ok += c.sent_ok;
      fail += c.sent_failed;
      recipients += c.recipient_count;
    }
    return { ok, fail, recipients, sends: campaigns.length };
  }, [campaigns]);

  function exportCsv() {
    const lines = [
      ["email", "subscriber_type", "user_id", "subscribed", "created_at"].map(csvEscape).join(","),
      ...filtered.map((r) =>
        [
          r.email,
          r.user_id ? "account" : "guest",
          r.user_id ?? "",
          r.subscribed ? "yes" : "no",
          r.created_at,
        ]
          .map(csvEscape)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Download started.");
  }

  async function manualUnsubscribe(subscriptionId: string) {
    setBusyId(subscriptionId);
    try {
      await setNewsletterSubscribedAdmin(subscriptionId, false);
      toast.success("Marked as unsubscribed.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={ADMIN_LIST_PAGE_CLASS}>
      <PageHeader
        title="Newsletter"
        description="Checkout opt-in (guest or signed-in). Checkout never unsubscribes. Marketing sends use Compose & send; order confirmation emails stay transactional only."
        actions={
          <Link to="/dashboard/newsletter/send">
            <Button type="button" variant="default" size="sm">
              <Send className="mr-2 h-4 w-4" />
              Compose & send
            </Button>
          </Link>
        }
      />

      <AdminListCard
        title="Send analytics (recent)"
        description={`${campaignTotals.sends} broadcast(s) logged — ${campaignTotals.ok} emails reported ok, ${campaignTotals.fail} failed, ${campaignTotals.recipients} total recipient slots. Open a row for full recipient list.`}
      >
        {loading ? (
          <AdminListSkeleton rows={3} />
        ) : campaigns.length === 0 ? (
          <p className="px-1 text-sm text-muted-foreground">
            No campaigns yet. Use Compose & send to run a broadcast.
          </p>
        ) : (
          <TableContainer>
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className={ADMIN_TABLE_HEAD}>
                  <th className={adminTh()}>When</th>
                  <th className={adminTh()}>Subject</th>
                  <th className={adminTh()}>Recipients</th>
                  <th className={adminTh()}>Ok / Failed</th>
                  <th className={adminThEnd()}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className={ADMIN_TABLE_ROW}>
                    <td className={adminTd()}>
                      <span className="whitespace-nowrap text-muted-foreground">
                        {c.created_at ? new Date(c.created_at).toLocaleString() : "—"}
                      </span>
                    </td>
                    <td className={cn(adminTd(), "max-w-md")}>
                      <span className="line-clamp-2 font-medium text-foreground">{c.subject}</span>
                    </td>
                    <td className={adminTd()}>
                      <span className="tabular-nums">{c.recipient_count}</span>
                    </td>
                    <td className={adminTd()}>
                      <span className="tabular-nums text-muted-foreground">
                        {c.sent_ok} / {c.sent_failed}
                      </span>
                    </td>
                    <td className={adminThEnd()}>
                      <div className="flex justify-end">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/dashboard/newsletter/campaigns/${c.id}`}>View</Link>
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

      <AdminListCard
        title="Subscribers"
        description="Guests have no user id. Export reflects the current filters."
        headerRight={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <div className="flex flex-wrap gap-2">
              {(["all", "subscribed", "unsubscribed"] as const).map((k) => (
                <Button
                  key={k}
                  type="button"
                  size="sm"
                  variant={statusFilter === k ? "default" : "outline"}
                  className="capitalize"
                  onClick={() => setStatusFilter(k)}
                >
                  {k}
                </Button>
              ))}
            </div>
            <div className="relative w-full min-w-[min(100%,16rem)] sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search email or user id…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-9 pl-9"
                aria-label="Filter subscribers"
              />
            </div>
          </div>
        }
      >
        {loading ? (
          <AdminListSkeleton rows={8} />
        ) : filtered.length === 0 ? (
          <AdminListEmpty>
            {rows.length === 0
              ? "No records yet. When customers check “Email me with news and offers” at checkout, they appear here (guest or account)."
              : "No matches — try a different search or status filter."}
          </AdminListEmpty>
        ) : (
          <TableContainer>
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className={ADMIN_TABLE_HEAD}>
                  <th className={adminTh()}>Email</th>
                  <th className={adminTh()}>Type</th>
                  <th className={adminTh()}>User</th>
                  <th className={adminTh()}>Status</th>
                  <th className={adminTh()}>Created</th>
                  <th className={adminThEnd()}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className={ADMIN_TABLE_ROW}>
                    <td className={adminTd()}>
                      <span className="font-medium text-foreground">{r.email}</span>
                    </td>
                    <td className={adminTd()}>
                      {r.user_id ? (
                        <Badge variant="outline">Account</Badge>
                      ) : (
                        <Badge variant="secondary">Guest</Badge>
                      )}
                    </td>
                    <td className={adminTd()}>
                      {r.user_id ? (
                        <Link
                          to={`/dashboard/customers/${r.user_id}`}
                          className="font-mono text-xs text-primary underline-offset-2 hover:underline"
                        >
                          {r.user_id}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={adminTd()}>
                      {r.subscribed ? (
                        <Badge variant="outline" className="border-emerald-300 text-emerald-800">
                          Subscribed
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Unsubscribed</Badge>
                      )}
                    </td>
                    <td className={adminTd()}>
                      <span className="whitespace-nowrap text-muted-foreground">
                        {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                      </span>
                    </td>
                    <td className={adminThEnd()}>
                      <div className="flex justify-end">
                        {r.subscribed ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busyId === r.id}
                            onClick={() => void manualUnsubscribe(r.id)}
                          >
                            {busyId === r.id ? "Saving…" : "Unsubscribe"}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
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
