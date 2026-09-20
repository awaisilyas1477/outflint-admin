import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ExternalLink, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ADMIN_MSG_CATALOG_UNAVAILABLE,
  ADMIN_MSG_STOREFRONT_URL_MISSING,
} from "@/lib/admin-user-messages";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ProductDescriptionEditor } from "@/components/dashboard/product-description-editor";
import {
  deletePolicyPage,
  fetchPolicyPageById,
  insertPolicyPage,
  updatePolicyPage,
} from "@/lib/supabase/policy-pages-admin";
import { supabase } from "@/lib/supabase/client";
import { FOOTER_DASHBOARD_BASE } from "@/config/footer-dashboard";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { AdminStandardDialogContent } from "@/components/ui/admin-standard-dialog";
import { SeoFieldsSection } from "@/components/dashboard/seo-fields-section";
import { revalidateStorefront } from "@/lib/seo/revalidate";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function storefrontPublicBaseUrl(): string | null {
  const raw = import.meta.env.VITE_STOREFRONT_ORIGIN?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

export function PolicyEditPage() {
  const { policyId } = useParams<{ policyId: string }>();
  const navigate = useNavigate();
  const isNew = policyId === "new" || !policyId;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [html, setHtml] = useState("<p></p>");

  const publicBase = storefrontPublicBaseUrl();
  const previewUrl =
    publicBase && slug.trim() && SLUG_RE.test(slug.trim())
      ? `${publicBase}/${encodeURIComponent(slug.trim().toLowerCase())}`
      : null;

  useEffect(() => {
    if (isNew || !policyId || !supabase) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const row = await fetchPolicyPageById(policyId);
      if (cancelled) return;
      if (!row) {
        toast.error("Footer item not found.");
        setLoading(false);
        navigate(FOOTER_DASHBOARD_BASE, { replace: true });
        return;
      }
      setSlug(row.slug);
      setTitle(row.title);
      setSortOrder(String(row.sort_order));
      setHtml(row.content_html?.trim() ? row.content_html : "<p></p>");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, policyId, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) {
      toast.error(ADMIN_MSG_CATALOG_UNAVAILABLE);
      return;
    }

    const slugNorm = slug.trim().toLowerCase();
    const titleTrim = title.trim();
    if (!titleTrim) {
      toast.error("Title is required.");
      return;
    }
    if (!slugNorm || !SLUG_RE.test(slugNorm)) {
      toast.error("Use a URL slug with lowercase letters, numbers, and hyphens only (e.g. privacy-policy).");
      return;
    }

    const sort = Number.parseInt(sortOrder, 10);
    if (Number.isNaN(sort)) {
      toast.error("Sort order must be a whole number.");
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const res = await insertPolicyPage({
          slug: slugNorm,
          title: titleTrim,
          content_html: html.trim() || "<p></p>",
          sort_order: sort,
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Footer item created.");
        navigate(`${FOOTER_DASHBOARD_BASE}/${res.id}`, { replace: true });
        return;
      }
      if (!policyId) return;
      const res = await updatePolicyPage(policyId, {
        slug: slugNorm,
        title: titleTrim,
        content_html: html.trim() || "<p></p>",
        sort_order: sort,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Save failed.");
        return;
      }
      toast.success("Footer item saved.");
      void revalidateStorefront({ policySlug: slugNorm });
    } finally {
      setSaving(false);
    }
  }

  async function onConfirmDelete() {
    if (!policyId || isNew || !supabase) return;
    setDeleting(true);
    try {
      const res = await deletePolicyPage(policyId);
      if (!res.ok) {
        toast.error(res.error ?? "Delete failed.");
        return;
      }
      toast.success("Footer item deleted.");
      navigate(FOOTER_DASHBOARD_BASE, { replace: true });
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-10">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6">
      <PageHeader
        title={isNew ? "New footer item" : "Edit footer item"}
        description="Customers open this page from its footer link. The web address uses your public store site and this item’s slug (for example /privacy-policy)."
        actions={
          previewUrl ? (
            <Button variant="outline" size="sm" asChild>
              <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Open on your store
              </a>
            </Button>
          ) : null
        }
      />

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Footer item details</CardTitle>
            <CardDescription>Title and slug define the footer link and page URL.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="policy-title">Footer item title</Label>
              <Input
                id="policy-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Shipping Policy"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="policy-slug">Footer item slug</Label>
              <Input
                id="policy-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="e.g. privacy"
                required
                className="font-mono text-sm"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                Path on your store:{" "}
                <code className="rounded bg-muted px-1">/{slug.trim() || "…"}</code>
                {previewUrl ? (
                  <>
                    {" · "}
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Preview
                    </a>
                  </>
                ) : publicBase ? null : (
                  <span className="block pt-1 text-muted-foreground">{ADMIN_MSG_STOREFRONT_URL_MISSING}</span>
                )}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="policy-sort">Sort order</Label>
              <Input
                id="policy-sort"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="max-w-[120px]"
              />
              <p className="text-xs text-muted-foreground">Lower numbers appear first in the footer item list.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Footer page content</CardTitle>
            <CardDescription>
              Use clear headings and lists. Text and links are checked before they appear on your store.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Label className="mb-2 block text-sm font-medium">Body</Label>
            <ProductDescriptionEditor
              id="policy-body"
              value={html}
              onChange={setHtml}
              placeholder="Write what customers should read on this page."
            />
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving}>
                        {saving ? "Saving…" : isNew ? "Create item" : "Save changes"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(FOOTER_DASHBOARD_BASE)}>
            Back to list
          </Button>
          {!isNew && policyId ? (
            <>
              <Button
                type="button"
                variant="destructive"
                className="ml-auto"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
              <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AdminStandardDialogContent
                  title="Delete this footer item?"
                  subtitle="The live URL will return 404 and this item will be removed from the storefront footer."
                  footer={
                    <DialogFooter className="gap-2 sm:gap-0">
                      <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={deleting}
                        onClick={() => void onConfirmDelete()}
                      >
                        {deleting ? "Deleting…" : "Delete"}
                      </Button>
                    </DialogFooter>
                  }
                />
              </Dialog>
            </>
          ) : null}
        </div>
      </form>

      {!isNew && policyId ? (
        <SeoFieldsSection
          subjectType="policy_page"
          subjectId={policyId}
          revalidate={slug.trim() ? { policySlug: slug.trim() } : null}
        />
      ) : null}
    </div>
  );
}
