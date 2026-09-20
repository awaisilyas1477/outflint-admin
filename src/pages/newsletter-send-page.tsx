import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/dashboard/page-header";
import { ADMIN_LIST_PAGE_CLASS } from "@/components/dashboard/admin-list-shell";
import { useAuth } from "@/contexts/auth-context";
import { getStorefrontOrigin } from "@/lib/storefront-api";
import { toast } from "sonner";

export function NewsletterSendPage() {
  const { session } = useAuth();
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!session?.access_token) {
      toast.error("No session.");
      return;
    }
    const s = subject.trim();
    const h = html.trim();
    if (!s || !h) {
      toast.error("Subject and HTML body are required.");
      return;
    }
    setSending(true);
    try {
      const base = getStorefrontOrigin();
      const res = await fetch(`${base}/api/admin/newsletter/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ subject: s, html: h }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        recipient_count?: number;
        sent_ok?: number;
        sent_failed?: number;
        sample_errors?: string[];
      };
      if (!res.ok || data.ok !== true) {
        toast.error(data.error ?? `Send failed (${res.status})`);
        return;
      }
      toast.success(
        `Sent: ${data.sent_ok ?? 0} ok, ${data.sent_failed ?? 0} failed, of ${data.recipient_count ?? 0} recipients.`,
      );
      if (data.sample_errors?.length) {
        toast.message(data.sample_errors.slice(0, 3).join("\n"));
      }
      setSubject("");
      setHtml("");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "The request could not be completed. Check your connection and try again.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={ADMIN_LIST_PAGE_CLASS}>
      <PageHeader
        title="Send newsletter"
        description="Sends one marketing email per subscriber. Footer links are added automatically. Email delivery uses your store’s mail settings."
        actions={
          <Link to="/dashboard/newsletter">
            <Button type="button" variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Subscribers
            </Button>
          </Link>
        }
      />

      <div className="mx-auto max-w-3xl space-y-6 rounded-xl border border-border/70 bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <Label htmlFor="nl-subject">Subject</Label>
          <Input
            id="nl-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Spring sale — 20% off"
            maxLength={220}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nl-html">HTML body</Label>
          <textarea
            id="nl-html"
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            rows={14}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
            placeholder="<p>Hello …</p>"
          />
          <p className="text-xs text-muted-foreground">
            Trusted admins only — raw HTML is emailed as-is. Unsubscribe / subscribe-again links are appended per
            recipient.
          </p>
        </div>
        <Button type="button" disabled={sending} onClick={() => void send()}>
          <Send className="mr-2 h-4 w-4" />
          {sending ? "Sending…" : "Send to all subscribed"}
        </Button>
      </div>
    </div>
  );
}
