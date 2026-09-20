import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/dashboard/page-header";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  deleteColorRow,
  fetchColorById,
  saveColor,
  type ColorWritePayload,
} from "@/lib/supabase/catalog";
import { uploadColorSwatch } from "@/lib/supabase/storage";
import { supabase } from "@/lib/supabase/client";

/** Normalize to #rrggbb or null */
function expandToHex6(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const withHash = s.startsWith("#") ? s : `#${s}`;
  const m3 = withHash.match(/^#([0-9a-fA-F]{3})$/);
  if (m3) {
    const [a, b, c] = m3[1]!.split("");
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  const m6 = withHash.match(/^#([0-9a-fA-F]{6})$/);
  if (m6) return `#${m6[1]!.toLowerCase()}`;
  return null;
}

function rgbCssFromHex6(hex7: string): string {
  const n = Number.parseInt(hex7.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgb(${r}, ${g}, ${b})`;
}

/** Value for <input type="color" /> — must be #rrggbb */
function pickerHexValue(hexState: string): string {
  return expandToHex6(hexState) ?? "#000000";
}

export function ColorEditPage() {
  const { colorId } = useParams<{ colorId: string }>();
  const navigate = useNavigate();
  const isNew = colorId === "new" || !colorId;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploadingSwatch, setUploadingSwatch] = useState(false);
  const [name, setName] = useState("");
  const [hex, setHex] = useState("");
  const [rgb, setRgb] = useState("");
  const [swatchImageUrl, setSwatchImageUrl] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState("0");

  useEffect(() => {
    if (isNew || !colorId || !supabase) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const row = await fetchColorById(colorId);
      if (cancelled) return;
      if (!row) {
        toast.error("Color not found.");
        setLoading(false);
        return;
      }
      setName(row.name);
      setHex(row.hex ?? "");
      setRgb(row.rgb ?? "");
      setSwatchImageUrl(row.swatch_image_url ?? "");
      setIsActive(row.is_active);
      setSortOrder(String(row.sort_order));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, colorId]);

  async function onSwatchFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingSwatch(true);
    const res = await uploadColorSwatch(file);
    setUploadingSwatch(false);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    setSwatchImageUrl(res.publicUrl);
    toast.success("Swatch uploaded — save to persist.");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) {
      toast.error(ADMIN_MSG_CATALOG_UNAVAILABLE);
      return;
    }
    const sort = Number.parseInt(sortOrder, 10);
    if (Number.isNaN(sort)) {
      toast.error("Sort order must be a whole number.");
      return;
    }
    const payload: ColorWritePayload = {
      name: name.trim(),
      hex: hex.trim() === "" ? null : hex.trim(),
      rgb: rgb.trim() === "" ? null : rgb.trim(),
      swatch_image_url: swatchImageUrl.trim(),
      is_active: isActive,
      sort_order: sort,
    };
    if (!payload.name) {
      toast.error("Name is required.");
      return;
    }
    setSaving(true);
    const result = await saveColor(isNew ? null : colorId ?? null, payload);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Saved.");
    if (isNew) {
      navigate(`/dashboard/colors/${result.id}`, { replace: true });
    }
  }

  async function onDelete() {
    if (isNew || !colorId || !supabase) return;
    if (!window.confirm("Delete this color? Variants will have color cleared.")) return;
    const err = await deleteColorRow(colorId);
    if (err) {
      toast.error(err);
      return;
    }
    navigate("/dashboard/colors");
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
        backLink={{ to: "/dashboard/colors", label: "Colors" }}
        title={isNew ? "New color" : "Edit color"}
        description="Define a swatch for product variants: hex or RGB, optional texture image, and picker visibility."
      />

      <form onSubmit={(e) => void onSubmit(e)} className="mx-auto w-full max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Color</CardTitle>
            <CardDescription>
              Use the color picker or type hex / CSS rgb, and optionally a swatch image. At least one
              visual is recommended for the storefront.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="co-name">Name</Label>
              <Input
                id="co-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Graphite"
              />
              <p className="text-xs text-muted-foreground">
                Shown in variant options and stored as <code className="text-[0.7rem]">color</code>{" "}
                in the storefront.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-4 dark:bg-muted/15">
              <div className="flex flex-wrap items-end gap-4 sm:gap-6">
                <div className="space-y-2">
                  <Label htmlFor="co-picker">Color picker</Label>
                  <div className="flex items-center gap-3">
                    <input
                      id="co-picker"
                      type="color"
                      value={pickerHexValue(hex)}
                      onChange={(e) => {
                        const v = e.target.value.toLowerCase();
                        setHex(v);
                        setRgb(rgbCssFromHex6(v));
                      }}
                      className="h-12 w-14 cursor-pointer rounded-md border border-input bg-background p-1 shadow-sm"
                      title="Choose a color — fills hex and RGB"
                    />
                    <p className="max-w-48 text-xs text-muted-foreground">
                      Choosing a color fills <span className="font-medium text-foreground">Hex</span>{" "}
                      and <span className="font-medium text-foreground">RGB</span> automatically.
                    </p>
                  </div>
                </div>
                <div
                  className="h-14 w-14 shrink-0 rounded-lg border border-border shadow-inner"
                  style={{ backgroundColor: pickerHexValue(hex) }}
                  aria-hidden
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="co-hex">Hex (optional)</Label>
                <Input
                  id="co-hex"
                  value={hex}
                  onChange={(e) => {
                    const v = e.target.value;
                    setHex(v);
                    const full = expandToHex6(v);
                    if (full) setRgb(rgbCssFromHex6(full));
                  }}
                  placeholder="#171717"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="co-rgb">RGB (optional)</Label>
                <Input
                  id="co-rgb"
                  value={rgb}
                  onChange={(e) => setRgb(e.target.value)}
                  placeholder="rgb(23, 23, 23)"
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="co-swatch-file">Swatch image (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Texture or pattern — uploads to <code className="text-[0.75rem]">colors/swatches/</code>
              </p>
              <Input
                id="co-swatch-file"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                disabled={uploadingSwatch}
                onChange={(e) => void onSwatchFile(e)}
                className="cursor-pointer text-sm file:mr-3"
              />
              {uploadingSwatch ? (
                <p className="text-xs text-muted-foreground">Uploading…</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="co-swatch-url">Or swatch image URL</Label>
              <Input
                id="co-swatch-url"
                value={swatchImageUrl}
                onChange={(e) => setSwatchImageUrl(e.target.value)}
                placeholder="https://…"
              />
              {swatchImageUrl ? (
                <span className="inline-block overflow-hidden rounded border border-border">
                  <img
                    src={swatchImageUrl}
                    alt=""
                    className="h-16 w-16 object-cover"
                  />
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={isActive} onCheckedChange={(c) => setIsActive(c === true)} />
                Active (show in product color picker)
              </label>
              <div className="flex items-center gap-2">
                <Label htmlFor="co-sort" className="whitespace-nowrap">
                  Sort order
                </Label>
                <Input
                  id="co-sort"
                  className="w-24"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  required
                  inputMode="numeric"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={saving || uploadingSwatch}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {!isNew ? (
            <Button type="button" variant="destructive" onClick={() => void onDelete()}>
              Delete color
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
