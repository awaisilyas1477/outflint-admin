import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/dashboard/page-header";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADMIN_MSG_CATALOG_UNAVAILABLE } from "@/lib/admin-user-messages";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { deleteTagRow, fetchTagById, saveTag, type TagWritePayload } from "@/lib/supabase/catalog";
import { supabase } from "@/lib/supabase/client";
import { slugFromLabel } from "@/lib/slug";
import { SeoFieldsSection } from "@/components/dashboard/seo-fields-section";
import { revalidateStorefront } from "@/lib/seo/revalidate";

export function TagEditPage() {
  const { tagId } = useParams<{ tagId: string }>();
  const navigate = useNavigate();
  const isNew = tagId === "new" || !tagId;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (isNew || !tagId || !supabase) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const row = await fetchTagById(tagId);
      if (cancelled) return;
      if (!row) {
        toast.error("Tag not found.");
        setLoading(false);
        return;
      }
      setLabel(row.label);
      setName(row.name);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, tagId]);

  function syncNameFromLabel(nextLabel: string) {
    if (isNew) {
      setName(slugFromLabel(nextLabel));
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) {
      toast.error(ADMIN_MSG_CATALOG_UNAVAILABLE);
      return;
    }
    const payload: TagWritePayload = {
      name: name.trim() ? name.trim().toLowerCase() : slugFromLabel(label),
      label: label.trim(),
    };
    if (!payload.label) {
      toast.error("Label is required.");
      return;
    }
    if (!payload.name) {
      toast.error("Name must be a non-empty slug (letters, numbers, hyphens).");
      return;
    }

    setSaving(true);
    const result = await saveTag(isNew ? null : tagId ?? null, payload);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Saved.");
    void revalidateStorefront({ all: true });
    if (isNew) {
      navigate(`/dashboard/tags/${result.id}`, { replace: true });
    }
  }

  async function onDelete() {
    if (isNew || !tagId || !supabase) return;
    if (
      !window.confirm(
        "Delete this tag? Links on products and tag-based collections are removed automatically. The tag name is also removed from each product’s legacy tags list.",
      )
    ) {
      return;
    }
    const err = await deleteTagRow(tagId);
    if (err) {
      toast.error(err);
      return;
    }
    void revalidateStorefront({ all: true });
    navigate("/dashboard/tags");
  }

  if (!supabase) {
    return (
      <p className="text-sm text-muted-foreground">{ADMIN_MSG_CATALOG_UNAVAILABLE}</p>
    );
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        backLink={{ to: "/dashboard/tags", label: "Tags" }}
        title={isNew ? "New tag" : "Edit tag"}
        description="Use tags to label products and to build collections that update automatically."
      />

      <form onSubmit={(e) => void onSubmit(e)} className="mx-auto w-full max-w-4xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>
              Name is stored lowercase and must stay unique. Label is what you see in admin pickers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tag-label">Label</Label>
              <Input
                id="tag-label"
                value={label}
                onChange={(e) => {
                  const v = e.target.value;
                  setLabel(v);
                  syncNameFromLabel(v);
                }}
                required
                autoComplete="off"
                placeholder="Featured products"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag-name">Name (slug)</Label>
              <Input
                id="tag-name"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase())}
                required
                autoComplete="off"
                placeholder="featured"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {isNew
                  ? "Updates from the label until you edit it manually."
                  : "Changing the name may break links that relied on the old value."}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {!isNew ? (
            <Button type="button" variant="destructive" onClick={() => void onDelete()}>
              Delete tag
            </Button>
          ) : null}
        </div>
      </form>

      {!isNew && tagId ? (
        <div className="mx-auto w-full max-w-4xl">
          <SeoFieldsSection
            subjectType="tag"
            subjectId={tagId}
            revalidate={{ all: true }}
          />
        </div>
      ) : null}
    </div>
  );
}
