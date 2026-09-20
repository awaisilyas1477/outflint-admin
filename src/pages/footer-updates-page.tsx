import { useEffect, useId, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { ADMIN_LIST_PAGE_CLASS } from "@/components/dashboard/admin-list-shell";
import { ADMIN_MSG_CATALOG_UNAVAILABLE } from "@/lib/admin-user-messages";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FooterItemsListSection } from "@/components/dashboard/footer-items-list-section";
import { fetchFooterSettings, updateFooterSettingsTitle } from "@/lib/supabase/footer-settings";
import { revalidateStorefront } from "@/lib/seo/revalidate";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";

export function FooterUpdatesPage() {
  const titleId = useId();
  const [customerCareTitle, setCustomerCareTitle] = useState("Customer care");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!supabase) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    void fetchFooterSettings().then((row) => {
      if (row) {
        setCustomerCareTitle((row.customer_care_title ?? "").trim() || "Customer care");
      }
      setLoading(false);
    });
  }, []);

  async function onSaveHeading(e: FormEvent) {
    e.preventDefault();
    if (!supabase) {
      toast.error(ADMIN_MSG_CATALOG_UNAVAILABLE);
      return;
    }
    setSaving(true);
    try {
      const res = await updateFooterSettingsTitle(customerCareTitle);
      if (!res.ok) {
        toast.error(res.error ?? "Save failed.");
        return;
      }
      toast.success("Customer care heading saved.");
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
      // Bust the storefront's cached store-brand slice so the new heading
      // shows on the live site without waiting for the 5-min TTL.
      void revalidateStorefront({ all: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={ADMIN_LIST_PAGE_CLASS}>
      <PageHeader
        title="Footer"
        description="Set the customer care section heading and manage footer links shown on the storefront."
      />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Customer care — section title</CardTitle>
            <CardDescription>
              Shown as the heading above footer policy links (Contact us always appears first on the storefront).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <form onSubmit={onSaveHeading} className="flex max-w-xl flex-col gap-4 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1 space-y-2">
                  <Label htmlFor={titleId}>Heading</Label>
                  <Input
                    id={titleId}
                    value={customerCareTitle}
                    onChange={(e) => setCustomerCareTitle(e.target.value)}
                    placeholder="Customer care"
                  />
                </div>
                <Button type="submit" disabled={saving} className="shrink-0">
                  {saving ? "Saving…" : "Save heading"}
                </Button>
                {saved ? (
                  <span className="self-center text-sm text-muted-foreground sm:self-end" role="status">
                    Saved
                  </span>
                ) : null}
              </form>
            )}
          </CardContent>
        </Card>

        <FooterItemsListSection />
      </div>
    </div>
  );
}
