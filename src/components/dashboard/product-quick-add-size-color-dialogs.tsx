import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { AdminStandardDialogContent } from "@/components/ui/admin-standard-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { saveColor, saveSize, type ColorWritePayload, type SizeWritePayload } from "@/lib/supabase/catalog";
import type { ColorRow, SizeRow } from "@/lib/supabase/catalog-types";
import { slugFromLabel } from "@/lib/slug";
import { uploadColorSwatch } from "@/lib/supabase/storage";
import { supabase } from "@/lib/supabase/client";

/** Internal key for text sizes: letters, numbers, underscores; may start with a digit (e.g. 3xl). */
const TEXT_NAME_PATTERN = /^[a-z0-9][a-z0-9_]*$/;

/** Numeric sizes: integer or one decimal (e.g. 8, 8.5, 42). */
const NUMERIC_VALUE_PATTERN = /^\d+(\.\d+)?$/;

function suggestNameFromDisplay(display: string): string {
  const slug = slugFromLabel(display);
  if (!slug) return "";
  return slug.replace(/-/g, "_");
}

function normalizeTextSizeName(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (!s) return "";
  const slug = slugFromLabel(s);
  if (!slug) return "";
  return slug.replace(/-/g, "_");
}

function filterNumericSizeInput(next: string): string {
  let out = "";
  let dotSeen = false;
  for (const ch of next) {
    if (ch >= "0" && ch <= "9") {
      out += ch;
      continue;
    }
    if (ch === "." && !dotSeen) {
      dotSeen = true;
      out += ch;
    }
  }
  return out;
}

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

export type QuickAddSizeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingSizes: SizeRow[];
  onCreated: (row: SizeRow) => void;
};

/** Mirrors fields and copy from `SizeEditPage` (new size). */
export function QuickAddSizeDialog({
  open,
  onOpenChange,
  existingSizes,
  onCreated,
}: QuickAddSizeDialogProps) {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [sizeType, setSizeType] = useState<"numeric" | "text">("text");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const maxSort = existingSizes.reduce((m, s) => Math.max(m, s.sort_order), 0);
    queueMicrotask(() => {
      setSortOrder(String(maxSort + 1));
      setName("");
      setDisplayName("");
      setSizeType("text");
      setIsActive(true);
    });
  }, [open, existingSizes]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) {
      toast.error("Database is not configured.");
      return;
    }
    const sort = Number.parseInt(sortOrder, 10);
    if (Number.isNaN(sort)) {
      toast.error("Sort order must be a whole number.");
      return;
    }
    const trimmedDisplay = displayName.trim();
    const trimmedName =
      sizeType === "numeric" ? name.trim() : normalizeTextSizeName(name);
    if (!trimmedName) {
      toast.error("Name is required.");
      return;
    }
    if (!trimmedDisplay) {
      toast.error("Display name is required.");
      return;
    }
    if (sizeType === "numeric") {
      if (!NUMERIC_VALUE_PATTERN.test(trimmedName)) {
        toast.error(
          "For numeric size type, name must be a number only (e.g. 8 or 8.5). Letters and other characters are not allowed.",
        );
        return;
      }
      if (!NUMERIC_VALUE_PATTERN.test(trimmedDisplay)) {
        toast.error(
          "For numeric size type, display name must be a number only (e.g. 8 or 8.5).",
        );
        return;
      }
    } else {
      if (!TEXT_NAME_PATTERN.test(trimmedName)) {
        toast.error(
          "Name could not be normalized. Use letters and numbers (e.g. medium, 3xl, 12-20mm).",
        );
        return;
      }
    }

    const payload: SizeWritePayload = {
      name: trimmedName,
      display_name: trimmedDisplay,
      size_type: sizeType,
      sort_order: sort,
      is_active: isActive,
    };
    setSaving(true);
    const result = await saveSize(null, payload);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Size added.");
    const newRow: SizeRow = {
      id: result.id,
      name: trimmedName,
      display_name: trimmedDisplay,
      size_type: sizeType,
      sort_order: sort,
      is_active: isActive,
    };
    onCreated(newRow);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AdminStandardDialogContent
        className="max-w-lg"
        title="New size"
        subtitle="Same fields as the Sizes admin page. Saved to the catalog immediately and available in dropdowns here without refreshing."
        footer={
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="qa-size-form" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        }
      >
        <form id="qa-size-form" onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Size</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Use <span className="font-medium">text</span> for letter sizes (S, M, L) and{" "}
                <span className="font-medium">numeric</span> for measurements or shoe numbers.
                Inactive sizes stay on existing variants but are hidden from new selections.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="qa-sz-type">Size type</Label>
                <select
                  id="qa-sz-type"
                  value={sizeType}
                  onChange={(e) => {
                    const next = e.target.value as "numeric" | "text";
                    setSizeType(next);
                    if (next === "numeric") {
                      setName((n) => filterNumericSizeInput(n));
                      setDisplayName((d) => filterNumericSizeInput(d));
                    }
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                >
                  <option value="text">Text — any characters in name and display name</option>
                  <option value="numeric">Numeric — name and display name must be numbers only</option>
                </select>
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <Label htmlFor="qa-sz-name">Name</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      if (sizeType === "numeric") {
                        const t = displayName.trim();
                        if (NUMERIC_VALUE_PATTERN.test(t)) setName(t);
                        return;
                      }
                      const s = suggestNameFromDisplay(displayName);
                      if (s) setName(s);
                    }}
                  >
                    Suggest from display name
                  </Button>
                </div>
                <Input
                  id="qa-sz-name"
                  value={name}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (sizeType === "numeric") {
                      setName(filterNumericSizeInput(v));
                    } else {
                      setName(v);
                    }
                  }}
                  required
                  placeholder={sizeType === "numeric" ? "8.5" : "medium"}
                  className="font-mono text-sm"
                  autoComplete="off"
                  inputMode={sizeType === "numeric" ? "decimal" : "text"}
                />
                <p className="text-xs text-muted-foreground">
                  {sizeType === "numeric"
                    ? "Internal key: digits and at most one decimal point (e.g. 9 or 10.5)."
                  : "Saved as a normalized internal key (letters/numbers/underscores). Example: 12-20mm becomes 12_20mm."}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="qa-sz-display">Display name</Label>
                <Input
                  id="qa-sz-display"
                  value={displayName}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (sizeType === "numeric") {
                      setDisplayName(filterNumericSizeInput(v));
                    } else {
                      setDisplayName(v);
                    }
                  }}
                  required
                  placeholder={sizeType === "numeric" ? "8.5" : "Medium"}
                  autoComplete="off"
                  inputMode={sizeType === "numeric" ? "decimal" : "text"}
                />
                <p className="text-xs text-muted-foreground">
                  Shown in variant options and stored as the variant&apos;s size label.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="qa-sz-sort">Sort order</Label>
                <Input
                  id="qa-sz-sort"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  required
                  inputMode="numeric"
                />
                <p className="text-xs text-muted-foreground">Lower values appear first in dropdowns.</p>
              </div>
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <Checkbox checked={isActive} onCheckedChange={(c) => setIsActive(c === true)} />
                Active (available for new variants)
              </label>
            </CardContent>
          </Card>
        </form>
      </AdminStandardDialogContent>
    </Dialog>
  );
}

export type QuickAddColorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingColors: ColorRow[];
  onCreated: (row: ColorRow) => void;
};

/** Mirrors fields and copy from `ColorEditPage` (new color). */
export function QuickAddColorDialog({
  open,
  onOpenChange,
  existingColors,
  onCreated,
}: QuickAddColorDialogProps) {
  const [name, setName] = useState("");
  const [hex, setHex] = useState("");
  const [rgb, setRgb] = useState("");
  const [swatchImageUrl, setSwatchImageUrl] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingSwatch, setUploadingSwatch] = useState(false);

  useEffect(() => {
    if (!open) return;
    const maxSort = existingColors.reduce((m, c) => Math.max(m, c.sort_order), 0);
    queueMicrotask(() => {
      setSortOrder(String(maxSort + 1));
      setName("");
      setHex("");
      setRgb("");
      setSwatchImageUrl("");
      setIsActive(true);
    });
  }, [open, existingColors]);

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
    toast.success("Swatch uploaded.");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) {
      toast.error("Database is not configured.");
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
    const result = await saveColor(null, payload);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Color added.");
    const newRow: ColorRow = {
      id: result.id,
      name: payload.name,
      hex: payload.hex,
      rgb: payload.rgb,
      swatch_image_url: payload.swatch_image_url,
      is_active: payload.is_active,
      sort_order: sort,
    };
    onCreated(newRow);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AdminStandardDialogContent
        className="max-w-3xl"
        title="New color"
        subtitle="Same fields as the Colors admin page. Saved immediately and available in dropdowns here without refreshing."
        footer={
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="qa-color-form" disabled={saving || uploadingSwatch}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        }
      >
        <form id="qa-color-form" onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Color</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Use the color picker or type hex / CSS rgb, and optionally a swatch image. At least
                one visual is recommended for the storefront.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="qa-co-name">Name</Label>
                <Input
                  id="qa-co-name"
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
                    <Label htmlFor="qa-co-picker">Color picker</Label>
                    <div className="flex items-center gap-3">
                      <input
                        id="qa-co-picker"
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
                        Choosing a color fills{" "}
                        <span className="font-medium text-foreground">Hex</span> and{" "}
                        <span className="font-medium text-foreground">RGB</span> automatically.
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
                  <Label htmlFor="qa-co-hex">Hex (optional)</Label>
                  <Input
                    id="qa-co-hex"
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
                  <Label htmlFor="qa-co-rgb">RGB (optional)</Label>
                  <Input
                    id="qa-co-rgb"
                    value={rgb}
                    onChange={(e) => setRgb(e.target.value)}
                    placeholder="rgb(23, 23, 23)"
                    className="font-mono text-sm"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="qa-co-swatch-file">Swatch image (optional)</Label>
                <p className="text-xs text-muted-foreground">
                  Texture or pattern — uploads to <code className="text-[0.75rem]">colors/swatches/</code>
                </p>
                <Input
                  id="qa-co-swatch-file"
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
                <Label htmlFor="qa-co-swatch-url">Or swatch image URL</Label>
                <Input
                  id="qa-co-swatch-url"
                  value={swatchImageUrl}
                  onChange={(e) => setSwatchImageUrl(e.target.value)}
                  placeholder="https://…"
                />
                {swatchImageUrl ? (
                  <span className="inline-block overflow-hidden rounded border border-border">
                    <img src={swatchImageUrl} alt="" className="h-16 w-16 object-cover" />
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-6">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={isActive} onCheckedChange={(c) => setIsActive(c === true)} />
                  Active (show in product color picker)
                </label>
                <div className="flex items-center gap-2">
                  <Label htmlFor="qa-co-sort" className="whitespace-nowrap">
                    Sort order
                  </Label>
                  <Input
                    id="qa-co-sort"
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
        </form>
      </AdminStandardDialogContent>
    </Dialog>
  );
}
