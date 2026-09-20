import { useEffect, useState } from "react";
import type { FormEvent } from "react";
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
import { deleteSizeRow, fetchSizeById, saveSize, type SizeWritePayload } from "@/lib/supabase/catalog";
import { slugFromLabel } from "@/lib/slug";
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

export function SizeEditPage() {
  const { sizeId } = useParams<{ sizeId: string }>();
  const navigate = useNavigate();
  const isNew = sizeId === "new" || !sizeId;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [sizeType, setSizeType] = useState<"numeric" | "text">("text");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (isNew || !sizeId || !supabase) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const row = await fetchSizeById(sizeId);
      if (cancelled) return;
      if (!row) {
        toast.error("Size not found.");
        setLoading(false);
        return;
      }
      setName(row.name);
      setDisplayName(row.display_name);
      setSizeType(row.size_type);
      setSortOrder(String(row.sort_order));
      setIsActive(row.is_active);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, sizeId]);

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
    const result = await saveSize(isNew ? null : sizeId ?? null, payload);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Saved.");
    if (isNew) {
      navigate(`/dashboard/sizes/${result.id}`, { replace: true });
    }
  }

  async function onDelete() {
    if (isNew || !sizeId || !supabase) return;
    if (!window.confirm("Delete this size? Variants using it will have size cleared.")) return;
    const err = await deleteSizeRow(sizeId);
    if (err) {
      toast.error(err);
      return;
    }
    navigate("/dashboard/sizes");
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
        backLink={{ to: "/dashboard/sizes", label: "Sizes" }}
        title={isNew ? "New size" : "Edit size"}
        description="Internal name is stable for imports; display name is what shoppers see on variants."
      />

      <form onSubmit={(e) => void onSubmit(e)} className="mx-auto w-full max-w-lg space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Size</CardTitle>
            <CardDescription>
              Use <span className="font-medium">text</span> for letter sizes (S, M, L) and{" "}
              <span className="font-medium">numeric</span> for measurements or shoe numbers. Inactive
              sizes stay on existing variants but are hidden from new selections.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sz-type">Size type</Label>
              <select
                id="sz-type"
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
                <Label htmlFor="sz-name">Name</Label>
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
                id="sz-name"
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
              <Label htmlFor="sz-display">Display name</Label>
              <Input
                id="sz-display"
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
              <Label htmlFor="sz-sort">Sort order</Label>
              <Input
                id="sz-sort"
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

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {!isNew ? (
            <Button type="button" variant="destructive" onClick={() => void onDelete()}>
              Delete size
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
