/**
 * Per-product shopping/SEO attributes.
 *
 * Backed by `public.product_shopping_attributes` (1:1 with products).
 * Surfaces fields needed for Google Shopping rich results and Product JSON-LD:
 * brand, GTIN/EAN/UPC, MPN, country of origin, material, return/shipping
 * policy references, and an internal "first-party imagery" audit flag (HCS).
 *
 * Self-contained Save button (decoupled from the parent product save).
 */

import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  fetchProductShoppingAttributes,
  upsertProductShoppingAttributes,
} from "@/lib/supabase/seo";
import {
  fetchPolicyPagesAdmin,
  type PolicyPageAdminRow,
} from "@/lib/supabase/policy-pages-admin";
import { revalidateStorefront } from "@/lib/seo/revalidate";

export function ProductShoppingAttributesSection({
  productId,
  productSlug,
}: {
  productId: string | null;
  productSlug?: string | null;
}) {
  const brandId = useId();
  const gtinId = useId();
  const mpnId = useId();
  const cooId = useId();
  const matId = useId();
  const retId = useId();
  const shipId = useId();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [policies, setPolicies] = useState<PolicyPageAdminRow[]>([]);

  const [brandName, setBrandName] = useState("");
  const [gtin, setGtin] = useState("");
  const [mpn, setMpn] = useState("");
  const [countryOfOrigin, setCountryOfOrigin] = useState("");
  const [material, setMaterial] = useState("");
  const [returnPolicyId, setReturnPolicyId] = useState<string>("");
  const [shippingPolicyId, setShippingPolicyId] = useState<string>("");
  const [isOriginalImagery, setIsOriginalImagery] = useState(false);

  const lastIdRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    void fetchPolicyPagesAdmin().then((rows) => {
      if (!cancelled) setPolicies(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!productId) {
      setLoading(false);
      return;
    }
    lastIdRef.current = productId;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const row = await fetchProductShoppingAttributes(productId);
      if (cancelled || lastIdRef.current !== productId) return;
      setBrandName(row?.brand_name ?? "");
      setGtin(row?.gtin ?? "");
      setMpn(row?.mpn ?? "");
      setCountryOfOrigin(row?.country_of_origin ?? "");
      setMaterial(row?.material ?? "");
      setReturnPolicyId(row?.return_policy_id ?? "");
      setShippingPolicyId(row?.shipping_policy_id ?? "");
      setIsOriginalImagery(Boolean(row?.is_original_imagery));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  async function onSave() {
    if (!productId) return;
    const trimmedGtin = gtin.replace(/\D/g, "");
    if (trimmedGtin && ![8, 12, 13, 14].includes(trimmedGtin.length)) {
      toast.error("GTIN must be 8, 12, 13, or 14 digits (or empty).");
      return;
    }
    setSaving(true);
    try {
      const res = await upsertProductShoppingAttributes(productId, {
        brand_name: brandName.trim(),
        gtin: trimmedGtin,
        mpn: mpn.trim(),
        country_of_origin: countryOfOrigin.trim().toUpperCase(),
        material: material.trim(),
        return_policy_id: returnPolicyId || null,
        shipping_policy_id: shippingPolicyId || null,
        is_original_imagery: isOriginalImagery,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Save failed.");
        return;
      }
      toast.success("Shopping attributes saved.");
      if (productSlug) {
        void revalidateStorefront({ productSlug });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shopping & search attributes</CardTitle>
        <CardDescription>
          Powers Google Shopping rich results and richer Product JSON-LD. Optional but improves
          visibility in product carousels and AI overviews.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!productId ? (
          <p className="text-sm text-muted-foreground">
            Save the product first — shopping attributes are stored against its id.
          </p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Loading shopping attributes…</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={brandId}>Brand name</Label>
                <Input
                  id={brandId}
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="e.g. Outflint"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={gtinId}>GTIN / EAN / UPC</Label>
                <Input
                  id={gtinId}
                  value={gtin}
                  onChange={(e) => setGtin(e.target.value)}
                  placeholder="8 / 12 / 13 / 14 digits"
                  inputMode="numeric"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={mpnId}>MPN (manufacturer part number)</Label>
                <Input
                  id={mpnId}
                  value={mpn}
                  onChange={(e) => setMpn(e.target.value)}
                  placeholder="e.g. ABC-123-XL"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={cooId}>Country of origin (ISO 3166-1 alpha-2)</Label>
                <Input
                  id={cooId}
                  value={countryOfOrigin}
                  onChange={(e) => setCountryOfOrigin(e.target.value.toUpperCase())}
                  placeholder="e.g. PK"
                  maxLength={2}
                  className="max-w-[120px] font-mono uppercase"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={matId}>Material</Label>
              <Input
                id={matId}
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                placeholder="e.g. 100% cotton; canvas"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={retId}>Return policy</Label>
                <select
                  id={retId}
                  value={returnPolicyId}
                  onChange={(e) => setReturnPolicyId(e.target.value)}
                  className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm"
                >
                  <option value="">— None —</option>
                  {policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={shipId}>Shipping policy</Label>
                <select
                  id={shipId}
                  value={shippingPolicyId}
                  onChange={(e) => setShippingPolicyId(e.target.value)}
                  className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm"
                >
                  <option value="">— None —</option>
                  {policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={isOriginalImagery}
                onCheckedChange={(c) => setIsOriginalImagery(c === true)}
              />
              <span>
                <span className="block font-medium">First-party imagery</span>
                <span className="block text-xs text-muted-foreground">
                  Internal flag for Google's Helpful Content audit — set true when photos were
                  shot for this listing (not mirrored from a supplier).
                </span>
              </span>
            </label>

            <div className="flex items-center gap-3">
              <Button type="button" onClick={() => void onSave()} disabled={saving}>
                {saving ? "Saving…" : "Save shopping attributes"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Saves independently of the main product form.
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
