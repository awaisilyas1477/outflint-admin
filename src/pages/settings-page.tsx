import { useEffect, useId, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { APP_NAME } from "@/config/brand";
import { fetchStoreSettings, updateStoreSettings } from "@/lib/supabase/store-settings";
import { revalidateStorefront } from "@/lib/seo/revalidate";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";

const STORAGE_KEY = "ecom-admin-panel-settings-v1";

type Settings = {
  displayName: string;
  notifyOrders: boolean;
  notifyInventory: boolean;
};

function load(): Settings {
  if (typeof window === "undefined") {
    return {
      displayName: APP_NAME,
      notifyOrders: true,
      notifyInventory: true,
    };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        displayName: APP_NAME,
        notifyOrders: true,
        notifyInventory: true,
      };
    }
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : APP_NAME,
      notifyOrders: Boolean(parsed.notifyOrders ?? true),
      notifyInventory: Boolean(parsed.notifyInventory ?? true),
    };
  } catch {
    return {
      displayName: APP_NAME,
      notifyOrders: true,
      notifyInventory: true,
    };
  }
}

export function SettingsPage() {
  const dnId = useId();
  const storeNameId = useId();
  const supportEmailId = useId();
  const currencyId = useId();
  const [displayName, setDisplayName] = useState(APP_NAME);
  const [notifyOrders, setNotifyOrders] = useState(true);
  const [notifyInventory, setNotifyInventory] = useState(true);
  const [saved, setSaved] = useState(false);

  const [storeName, setStoreName] = useState("");
  const [siteTitle, setSiteTitle] = useState("");
  const [siteDescription, setSiteDescription] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [footerPhone, setFooterPhone] = useState("");
  const [footerHoursLine, setFooterHoursLine] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("PKR");
  const [storeLoading, setStoreLoading] = useState(true);
  const [storeSaved, setStoreSaved] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const s = load();
      setDisplayName(s.displayName);
      setNotifyOrders(s.notifyOrders);
      setNotifyInventory(s.notifyInventory);
    });
  }, []);

  useEffect(() => {
    if (!supabase) {
      queueMicrotask(() => setStoreLoading(false));
      return;
    }
    void fetchStoreSettings().then(({ row, fetchError }) => {
      if (fetchError) {
        toast.error(`Could not load store settings: ${fetchError}`);
      }
      if (row) {
        setStoreName(row.store_name);
        setSiteTitle(row.site_title ?? "");
        setSiteDescription(row.site_description ?? "");
        setSupportEmail(row.support_email);
        setFooterPhone(row.footer_phone ?? "");
        setFooterHoursLine(row.footer_hours_line ?? "");
        setDefaultCurrency(row.default_currency || "PKR");
      }
      setStoreLoading(false);
    });
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next: Settings = {
      displayName: displayName.trim() || APP_NAME,
      notifyOrders,
      notifyInventory,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      toast.error("Could not save preferences in this browser.");
      return;
    }
    toast.success("Workspace preferences saved.");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  async function onSaveStore(e: FormEvent) {
    e.preventDefault();
    const trimmedName = storeName.trim();
    if (!trimmedName) {
      toast.error("Store name is required — it powers the storefront and emails.");
      return;
    }
    const res = await updateStoreSettings({
      store_name: trimmedName,
      site_title: siteTitle.trim(),
      site_description: siteDescription.trim(),
      support_email: supportEmail.trim(),
      footer_phone: footerPhone.trim(),
      footer_hours_line: footerHoursLine.trim(),
      default_currency: defaultCurrency.trim().toUpperCase() || "PKR",
    });
    if (!res.ok) {
      toast.error(res.error ?? "Save failed.");
      return;
    }
    toast.success("Store settings saved.");
    setStoreSaved(true);
    window.setTimeout(() => setStoreSaved(false), 2500);
    // Bust the storefront's tag-revalidated layout cache so the new store
    // name / title / description / footer NAP propagate to the live site
    // without waiting for the 5-minute TTL.
    void revalidateStorefront({ all: true });
  }

  return (
    <div className={ADMIN_LIST_PAGE_CLASS}>
      <PageHeader
        title="Settings"
        description="Store profile and contact details are saved for your live site. Delivery pricing is under Store configuration → Delivery. Workspace preferences below stay in this browser only."
      />

      <div className="mx-auto w-full max-w-3xl">
        <Card className={ADMIN_LIST_CARD_CLASS}>
          <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search & social (SEO)
            </CardTitle>
            <CardDescription>
              Brand identity, default OG image, social profiles, search-engine verifications,
              analytics, and per-page overrides.
            </CardDescription>
          </CardHeader>
          <CardContent className={cn(ADMIN_LIST_CARD_CONTENT_CLASS)}>
            <Button asChild>
              <Link to="/dashboard/seo">Open SEO settings</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <form onSubmit={onSaveStore} className="mx-auto w-full max-w-3xl space-y-6">
        <Card className={ADMIN_LIST_CARD_CLASS}>
          <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
            <CardTitle>Store (database)</CardTitle>
            <CardDescription>
              Identity, SEO, and footer details shown to customers on the storefront.
            </CardDescription>
          </CardHeader>
          <CardContent className={cn(ADMIN_LIST_CARD_CONTENT_CLASS, "space-y-4")}>
            {storeLoading ? (
              <p className="text-sm text-muted-foreground">Loading store settings…</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Use <strong>Save store settings</strong> on this card for the live site. The{" "}
                  <strong>Save settings</strong> button at the bottom of the page only saves workspace preferences in
                  this browser. Database changes require an active admin sign-in.
                </p>
                <div className="space-y-2">
                  <Label htmlFor={storeNameId}>Store name</Label>
                  <Input
                    id={storeNameId}
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    autoComplete="organization"
                    required
                    placeholder="e.g. SimpleCartStore"
                  />
                  <p className="text-xs text-muted-foreground">
                    Required. Shown in the header, checkout, and transactional email subjects — stored only in the
                    database.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="site-title">Site title (SEO)</Label>
                  <Input
                    id="site-title"
                    value={siteTitle}
                    onChange={(e) => setSiteTitle(e.target.value)}
                    placeholder="Browser tab title — empty uses store name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="site-desc">Meta description</Label>
                  <Input
                    id="site-desc"
                    value={siteDescription}
                    onChange={(e) => setSiteDescription(e.target.value)}
                    placeholder="Short description for search results"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={supportEmailId}>Support email</Label>
                  <Input
                    id={supportEmailId}
                    type="email"
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="footer-phone">Footer phone / WhatsApp</Label>
                  <Input
                    id="footer-phone"
                    value={footerPhone}
                    onChange={(e) => setFooterPhone(e.target.value)}
                    placeholder="e.g. +92 300 1234567"
                  />
                  <p className="text-xs text-muted-foreground">
                    Used in the storefront footer and the product-page WhatsApp inquiry icon.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="footer-hours">Footer hours line</Label>
                  <Input
                    id="footer-hours"
                    value={footerHoursLine}
                    onChange={(e) => setFooterHoursLine(e.target.value)}
                    placeholder="e.g. Mon–Sat 9am–6pm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={currencyId}>Default currency (ISO 4217)</Label>
                  <Input
                    id={currencyId}
                    value={defaultCurrency}
                    onChange={(e) => setDefaultCurrency(e.target.value)}
                    placeholder="PKR"
                    className="max-w-[120px] font-mono uppercase"
                  />
                </div>

                <Button type="submit" size="sm">
                  Save store settings
                </Button>
                {storeSaved ? (
                  <span className="ml-2 text-sm text-muted-foreground" role="status">
                    Saved
                  </span>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </form>

      <form onSubmit={onSubmit} className="mx-auto w-full max-w-3xl space-y-6">
        <Card className={ADMIN_LIST_CARD_CLASS}>
          <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
            <CardTitle>Workspace</CardTitle>
            <CardDescription>Shown in the window title and command palette hints.</CardDescription>
          </CardHeader>
          <CardContent className={cn(ADMIN_LIST_CARD_CONTENT_CLASS, "space-y-4")}>
            <div className="space-y-2">
              <Label htmlFor={dnId}>Display name</Label>
              <Input
                id={dnId}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="organization"
              />
            </div>
          </CardContent>
        </Card>

        <Card className={ADMIN_LIST_CARD_CLASS}>
          <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Choose which alerts you want when in-app notifications are enabled.</CardDescription>
          </CardHeader>
          <CardContent className={cn(ADMIN_LIST_CARD_CONTENT_CLASS, "space-y-4")}>
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <Checkbox checked={notifyOrders} onCheckedChange={(c) => setNotifyOrders(c === true)} />
              Order events
            </label>
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <Checkbox checked={notifyInventory} onCheckedChange={(c) => setNotifyInventory(c === true)} />
              Low stock warnings
            </label>
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit">Save settings</Button>
          {saved ? (
            <span className="text-sm text-muted-foreground" role="status">
              Saved
            </span>
          ) : null}
        </div>
      </form>
    </div>
  );
}
