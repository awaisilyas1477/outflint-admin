import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { ChevronDown, ChevronUp, ImageIcon } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { toast } from "sonner";
import { ADMIN_DASHBOARD_MAX_CLASS } from "@/components/dashboard/admin-list-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";
import {
  deleteHomeHeroSlide,
  fetchHomeHeroSlidesAdmin,
  fetchHomePageSettings,
  insertHomeHeroSlide,
  saveMissionParagraph,
  updateHomeHeroSlide,
  type HomeHeroSlideRow,
} from "@/lib/supabase/home-marketing";
import { uploadHomeHeroImage } from "@/lib/supabase/storage";
import { ProductDescriptionEditor } from "@/components/dashboard/product-description-editor";
import { revalidateStorefront } from "@/lib/seo/revalidate";

export function HeroSectionPage() {
  const [loading, setLoading] = useState(true);
  const [mission, setMission] = useState("");
  const [savingMission, setSavingMission] = useState(false);
  const [slides, setSlides] = useState<HomeHeroSlideRow[]>([]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const [home, s] = await Promise.all([fetchHomePageSettings(), fetchHomeHeroSlidesAdmin()]);
    if (home.error) {
      toast.error(home.error);
    }
    if (s.error) {
      toast.error(s.error);
    }
    if (home.data) {
      setMission(home.data.mission);
    }
    setSlides(s.rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  async function onSaveMission(e: FormEvent) {
    e.preventDefault();
    setSavingMission(true);
    const result = await saveMissionParagraph(mission);
    setSavingMission(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Mission content saved.");
    void revalidateStorefront({ all: true });
  }

  function patchSlideLocal(id: string, patch: Partial<HomeHeroSlideRow>) {
    setSlides((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  async function onSaveSlide(row: HomeHeroSlideRow) {
    const title = row.title.trim();
    const image_url = row.image_url.trim();
    const href = row.href.trim() || "/";
    if (!image_url) {
      toast.error("Each slide needs an image URL or upload.");
      return;
    }
    const res = await updateHomeHeroSlide(row.id, {
      title,
      image_url,
      href,
      sort_order: row.sort_order,
      is_active: row.is_active,
    });
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Slide saved.");
    void revalidateStorefront({ all: true });
    await load();
  }

  async function onDeleteSlide(id: string) {
    if (!window.confirm("Remove this hero slide?")) return;
    const res = await deleteHomeHeroSlide(id);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Slide removed.");
    void revalidateStorefront({ all: true });
    await load();
  }

  async function onAddSlide() {
    const maxOrder = slides.reduce((m, s) => Math.max(m, s.sort_order), -1);
    const res = await insertHomeHeroSlide({
      title: "",
      image_url: "",
      href: "/",
      sort_order: maxOrder + 1,
      is_active: true,
    });
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Slide added — add title, image, and save.");
    await load();
  }

  async function onHeroFileChange(id: string, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingId(id);
    const up = await uploadHomeHeroImage(file);
    setUploadingId(null);
    if ("error" in up) {
      toast.error(up.error);
      return;
    }
    patchSlideLocal(id, { image_url: up.publicUrl });
    toast.success("Image uploaded — click Save slide to persist.");
  }

  async function moveSlide(id: string, dir: -1 | 1) {
    const idx = slides.findIndex((s) => s.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= slides.length) return;
    const a = slides[idx];
    const b = slides[j];
    const r1 = await updateHomeHeroSlide(a.id, { sort_order: b.sort_order });
    if (r1.error) {
      toast.error(r1.error);
      return;
    }
    const r2 = await updateHomeHeroSlide(b.id, { sort_order: a.sort_order });
    if (r2.error) {
      toast.error(r2.error);
      return;
    }
    void revalidateStorefront({ all: true });
    await load();
  }

  if (loading) {
    return (
      <div className={cn(ADMIN_DASHBOARD_MAX_CLASS, "text-sm text-muted-foreground")}>
        Loading hero section…
      </div>
    );
  }

  return (
    <div className={cn(ADMIN_DASHBOARD_MAX_CLASS, "space-y-8")}>
      <PageHeader
        title="Hero section"
        description="Homepage carousel slides and optional mission text below the hero. Configure the announcement bar under Store configuration → Announcement."
      />

      <form onSubmit={(e) => void onSaveMission(e)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Mission strip</CardTitle>
            <CardDescription>
              Rich text below the hero — same editor as the product long description. If empty, this
              block is hidden on the storefront.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="mission">Mission content</Label>
            <ProductDescriptionEditor
              id="mission"
              value={mission}
              onChange={setMission}
              placeholder="Optional message below the hero…"
            />
            <Button type="submit" disabled={savingMission}>
              {savingMission ? "Saving…" : "Save mission content"}
            </Button>
          </CardContent>
        </Card>
      </form>

      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Slides</h2>
            <p className="text-sm text-muted-foreground">
              Title on the image, link, and a wide image (about 12:5, e.g. 2400×1000) for a sharp
              full-width hero.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={() => void onAddSlide()}>
            Add slide
          </Button>
        </div>

        {slides.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No slides yet. Add slides here to show a hero on the homepage — until then the hero area
            stays hidden.
          </p>
        ) : (
          <ul className="space-y-6">
            {slides.map((row, i) => (
              <li key={row.id}>
                <Card>
                  <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-4">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-5 w-5 text-muted-foreground" aria-hidden />
                      <CardTitle className="text-base">Slide {i + 1}</CardTitle>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Move up"
                        disabled={i === 0}
                        onClick={() => void moveSlide(row.id, -1)}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Move down"
                        disabled={i === slides.length - 1}
                        onClick={() => void moveSlide(row.id, 1)}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`t-${row.id}`}>Title on image</Label>
                        <Input
                          id={`t-${row.id}`}
                          value={row.title}
                          onChange={(e) => patchSlideLocal(row.id, { title: e.target.value })}
                          autoComplete="off"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`h-${row.id}`}>Link (href)</Label>
                        <Input
                          id={`h-${row.id}`}
                          value={row.href}
                          onChange={(e) => patchSlideLocal(row.id, { href: e.target.value })}
                          placeholder="/"
                          autoComplete="off"
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`so-${row.id}`}>Sort order</Label>
                        <Input
                          id={`so-${row.id}`}
                          className="max-w-xs"
                          inputMode="numeric"
                          value={String(row.sort_order)}
                          onChange={(e) => {
                            const n = Number.parseInt(e.target.value, 10);
                            patchSlideLocal(row.id, {
                              sort_order: Number.isNaN(n) ? row.sort_order : n,
                            });
                          }}
                        />
                      </div>
                      <label className="flex items-center gap-2 pt-8 text-sm">
                        <Checkbox
                          checked={row.is_active}
                          onCheckedChange={(c) =>
                            patchSlideLocal(row.id, { is_active: c === true })
                          }
                        />
                        Active (shown on storefront)
                      </label>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`f-${row.id}`}>Hero image</Label>
                      <p className="text-xs text-muted-foreground">
                        Uploads go to{" "}
                        <code className="text-[0.75rem]">marketing/home-hero/</code> in your media
                        bucket. You can also paste a URL.
                      </p>
                      <Input
                        id={`f-${row.id}`}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                        disabled={uploadingId === row.id}
                        onChange={(e) => void onHeroFileChange(row.id, e)}
                        className="cursor-pointer text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm file:font-medium"
                      />
                      {uploadingId === row.id ? (
                        <p className="text-xs text-muted-foreground">Uploading…</p>
                      ) : null}
                      <Label htmlFor={`img-${row.id}`} className="pt-1">
                        Image URL
                      </Label>
                      <Input
                        id={`img-${row.id}`}
                        value={row.image_url}
                        onChange={(e) =>
                          patchSlideLocal(row.id, { image_url: e.target.value })
                        }
                        autoComplete="off"
                      />
                      {row.image_url ? (
                        <div className="mt-2 aspect-12/5 max-w-xl overflow-hidden rounded-md border border-border">
                          <img
                            src={row.image_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" onClick={() => void onSaveSlide(row)}>
                        Save slide
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => void onDeleteSlide(row.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
