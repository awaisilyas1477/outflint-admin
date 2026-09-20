import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ADMIN_LIST_CARD_CLASS, ADMIN_LIST_CARD_HEADER_CLASS } from "@/components/dashboard/admin-list-shell";
import { getStorefrontOrigin } from "@/lib/storefront-api";
import { fetchCatalogFeedWarningsAdmin, type CatalogFeedWarning } from "@/lib/supabase/catalog-feed-warnings";

type FeedHealth = {
  ok: boolean;
  status: number;
  rowCount: number;
  checkedAt: string;
  feedUrl?: string;
  error?: string;
};

export function CatalogFeedHealth() {
  const [health, setHealth] = useState<FeedHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [warnings, setWarnings] = useState<CatalogFeedWarning[]>([]);

  async function check() {
    setLoading(true);
    try {
      const origin = getStorefrontOrigin();
      const feedUrl = `${origin}/feeds/google-merchant.txt`;
      const apiUrl = `${origin}/api/admin/catalog-feed-health`;

      let data: FeedHealth | null = null;

      try {
        const apiRes = await fetch(apiUrl, { cache: "no-store" });
        if (apiRes.ok) {
          const json = (await apiRes.json()) as FeedHealth;
          data = { ...json, feedUrl: json.feedUrl ?? feedUrl };
        }
      } catch {
        // Fall back to direct feed fetch (CORS allowed on feed route).
      }

      if (!data) {
        const res = await fetch(feedUrl, { cache: "no-store" });
        const text = await res.text();
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        const rowCount = Math.max(0, lines.length - 1);
        data = {
          ok: res.ok,
          status: res.status,
          rowCount,
          checkedAt: new Date().toISOString(),
          feedUrl,
        };
      }

      setHealth(data);
    } catch (e) {
      setHealth({
        ok: false,
        status: 0,
        rowCount: 0,
        checkedAt: new Date().toISOString(),
        error:
          e instanceof Error
            ? `${e.message}. Check VITE_STOREFRONT_ORIGIN on the admin deployment.`
            : "Feed check failed. Check VITE_STOREFRONT_ORIGIN on the admin deployment.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void check();
      void fetchCatalogFeedWarningsAdmin(8).then(setWarnings);
    });
  }, []);

  const feedUrl = (() => {
    try {
      return health?.feedUrl ?? `${getStorefrontOrigin()}/feeds/google-merchant.txt`;
    } catch {
      return null;
    }
  })();

  return (
    <Card className={ADMIN_LIST_CARD_CLASS}>
      <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Meta / Google catalog feed</CardTitle>
            <CardDescription>Live health check of your storefront product feed.</CardDescription>
          </div>
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void check()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-5 text-sm">
        {!health ? (
          <p className="text-muted-foreground">Checking feed…</p>
        ) : health.error ? (
          <p className="text-destructive">{health.error}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={health.ok ? "success" : "destructive"}>
                {health.ok ? "Feed OK" : `HTTP ${health.status}`}
              </Badge>
              <span className="text-muted-foreground">{health.rowCount} product rows</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Last checked {new Date(health.checkedAt).toLocaleString()}
            </p>
          </>
        )}
        {feedUrl ? (
          <Button variant="link" className="h-auto p-0 text-xs" asChild>
            <a href={feedUrl} target="_blank" rel="noopener noreferrer">
              Open feed URL
              <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          </Button>
        ) : null}
        {warnings.length > 0 ? (
          <div className="border-t border-border/60 pt-3">
            <p className="mb-2 text-xs font-medium text-amber-800 dark:text-amber-400">
              Catalog warnings ({warnings.length})
            </p>
            <ul className="max-h-40 space-y-2 overflow-y-auto text-xs text-muted-foreground">
              {warnings.map((w) => (
                <li key={w.id}>
                  <span className="font-medium text-foreground">{w.label}</span>
                  <span className="block">{w.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : health && !health.error ? (
          <p className="text-xs text-muted-foreground">No catalog image/price warnings.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
