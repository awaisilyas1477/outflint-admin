import { useEffect, useId, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  ADMIN_LIST_CARD_CLASS,
  ADMIN_LIST_CARD_HEADER_CLASS,
  ADMIN_LIST_CARD_CONTENT_CLASS,
  ADMIN_LIST_PAGE_CLASS,
} from "@/components/dashboard/admin-list-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { fetchStoreSettings, updateStoreSettings } from "@/lib/supabase/store-settings";
import { DELIVERY_CURRENCY_OPTIONS, type DeliveryCurrencyCode } from "@/lib/delivery-currencies";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { Plus, Trash2 } from "lucide-react";

type FreeRuleRow = { id: string; minAmount: string; currency: DeliveryCurrencyCode };

function newRowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `r-${Math.random().toString(36).slice(2, 11)}`;
}

function parseThresholdsFromDb(raw: unknown): FreeRuleRow[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [{ id: newRowId(), minAmount: "", currency: "PKR" }];
  }
  const rows: FreeRuleRow[] = [];
  for (const x of raw) {
    const n = typeof x === "number" ? x : Number(x);
    if (!Number.isFinite(n) || n < 0) continue;
    rows.push({
      id: newRowId(),
      minAmount: String(n / 100),
      currency: "PKR",
    });
  }
  return rows.length > 0 ? rows : [{ id: newRowId(), minAmount: "", currency: "PKR" }];
}

export function DeliverySettingsPage() {
  const standardAmountId = useId();
  const [standardAmount, setStandardAmount] = useState("500");
  const [standardCurrency, setStandardCurrency] = useState<DeliveryCurrencyCode>("PKR");
  const [freeRules, setFreeRules] = useState<FreeRuleRow[]>([
    { id: newRowId(), minAmount: "", currency: "PKR" },
  ]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!supabase) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    void fetchStoreSettings().then(({ row, fetchError }) => {
      if (fetchError) {
        toast.error(`Could not load delivery settings: ${fetchError}`);
      }
      if (row) {
        const stdPaisa = row.standard_delivery_paisa ?? 50000;
        setStandardAmount(String(stdPaisa / 100));
        const cur = row.standard_delivery_currency?.toUpperCase().trim();
        setStandardCurrency(
          cur === "USD" || cur === "EUR" || cur === "PKR" ? cur : "PKR",
        );
        setFreeRules(parseThresholdsFromDb(row.free_delivery_thresholds_paisa));
      }
      setLoading(false);
    });
  }, []);

  function addRule() {
    setFreeRules((prev) => [...prev, { id: newRowId(), minAmount: "", currency: "PKR" }]);
  }

  function removeRule(id: string) {
    setFreeRules((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    if (standardCurrency !== "PKR") {
      toast.error("Checkout uses Pakistani Rupees (PKR) for delivery. Please choose PKR.");
      return;
    }

    const stdRaw = standardAmount.trim().replace(/,/g, "");
    const stdMajor = parseFloat(stdRaw);
    if (!Number.isFinite(stdMajor) || stdMajor < 0) {
      toast.error("Enter a valid standard delivery amount.");
      return;
    }
    const standard_delivery_paisa = Math.round(stdMajor * 100);

    for (const r of freeRules) {
      if (r.currency !== "PKR") {
        toast.error("Free-delivery rules must use PKR for now. Change currency to PKR or remove the row.");
        return;
      }
    }

    const thresholdPaisaList: number[] = [];
    for (const r of freeRules) {
      const t = r.minAmount.trim().replace(/,/g, "");
      if (t === "") continue;
      const major = parseFloat(t);
      if (!Number.isFinite(major) || major < 0) {
        toast.error("Each free-delivery rule needs a valid minimum amount, or clear the row.");
        return;
      }
      thresholdPaisaList.push(Math.round(major * 100));
    }

    const free_delivery_thresholds_paisa = [...new Set(thresholdPaisaList)].sort((a, b) => a - b);

    const res = await updateStoreSettings({
      standard_delivery_paisa,
      standard_delivery_currency: standardCurrency,
      free_delivery_thresholds_paisa,
    });
    if (!res.ok) {
      toast.error(res.error ?? "Save failed.");
      return;
    }
    toast.success("Delivery settings saved.");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className={ADMIN_LIST_PAGE_CLASS}>
      <PageHeader
        title="Delivery"
        description="Store-wide standard fee and cart minimums (before delivery). Totals exclude products marked “free delivery only” on each product — those lines do not count toward these thresholds. A cart with only those products pays no standard delivery."
      />

      <form onSubmit={(e) => void onSubmit(e)} className="mx-auto w-full max-w-3xl space-y-6">
        <Card className={ADMIN_LIST_CARD_CLASS}>
          <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
            <CardTitle>Standard delivery</CardTitle>
            <CardDescription>
              Enter amounts in rupees — use decimals for smaller amounts (for example{" "}
              <span className="whitespace-nowrap">499.99</span>). Per-product free delivery is
              enabled on each listing under Products (edit product).
            </CardDescription>
          </CardHeader>
          <CardContent className={cn(ADMIN_LIST_CARD_CONTENT_CLASS, "space-y-4")}>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-0 flex-1 space-y-2 sm:max-w-[220px]">
                    <Label htmlFor={standardAmountId}>Amount</Label>
                    <Input
                      id={standardAmountId}
                      inputMode="decimal"
                      value={standardAmount}
                      onChange={(e) => setStandardAmount(e.target.value)}
                      placeholder="500"
                      autoComplete="off"
                    />
                  </div>
                  <div className="w-full space-y-2 sm:w-40">
                    <Label htmlFor="standard-delivery-currency">Currency</Label>
                    <NativeSelect
                      id="standard-delivery-currency"
                      value={standardCurrency}
                      onChange={(e) => setStandardCurrency(e.target.value as DeliveryCurrencyCode)}
                      containerClassName="sm:w-40"
                    >
                      {DELIVERY_CURRENCY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Checkout currently applies PKR amounts only — choose <strong>PKR</strong> so orders can complete.
                </p>

                <div className="border-t border-border pt-6">
                  <p className="text-sm font-medium">Free delivery rules</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add one or more minimums: when the customer’s{" "}
                    <strong>chargeable</strong> product subtotal (before delivery — excluding
                    per-product free-delivery lines) reaches <strong>any</strong> of these amounts,
                    standard delivery is free for the order.
                  </p>
                  <ul className="mt-4 space-y-3">
                    {freeRules.map((rule, index) => (
                      <li
                        key={rule.id}
                        className="flex flex-wrap items-end gap-2 rounded-lg border border-border/80 bg-muted/20 p-3"
                      >
                        <span className="mb-2 w-full text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:mb-0 sm:w-auto sm:shrink-0">
                          Rule {index + 1}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1.5 sm:max-w-[200px]">
                          <Label className="text-xs">Minimum product total</Label>
                          <Input
                            inputMode="decimal"
                            value={rule.minAmount}
                            onChange={(e) =>
                              setFreeRules((prev) =>
                                prev.map((r) =>
                                  r.id === rule.id ? { ...r, minAmount: e.target.value } : r,
                                ),
                              )
                            }
                            placeholder="e.g. 5000"
                            autoComplete="off"
                          />
                        </div>
                        <div className="w-full space-y-1.5 sm:w-36">
                          <Label className="text-xs">Currency</Label>
                          <NativeSelect
                            value={rule.currency}
                            onChange={(e) =>
                              setFreeRules((prev) =>
                                prev.map((r) =>
                                  r.id === rule.id
                                    ? { ...r, currency: e.target.value as DeliveryCurrencyCode }
                                    : r,
                                ),
                              )
                            }
                            containerClassName="w-full"
                          >
                            {DELIVERY_CURRENCY_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </NativeSelect>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeRule(rule.id)}
                          disabled={freeRules.length <= 1}
                          aria-label="Remove rule"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <Button type="button" variant="outline" size="sm" className="mt-3 gap-1.5" onClick={addRule}>
                    <Plus className="h-4 w-4" />
                    Add rule
                  </Button>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button type="submit" size="sm">
                    Save delivery settings
                  </Button>
                  {saved ? (
                    <span className="text-sm text-muted-foreground" role="status">
                      Saved
                    </span>
                  ) : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
