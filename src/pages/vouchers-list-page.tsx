import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, TicketPercent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { toast } from "sonner";
import { ADMIN_MSG_CATALOG_UNAVAILABLE } from "@/lib/admin-user-messages";
import {
  AdminListCard,
  AdminListSkeleton,
  AdminListEmpty,
  ADMIN_LIST_PAGE_CLASS,
  TableContainer,
  ADMIN_TABLE_HEAD,
  ADMIN_TABLE_ROW,
  adminTh,
  adminThEnd,
  adminTd,
} from "@/components/dashboard/admin-list-shell";
import { cn } from "@/lib/utils";
import {
  fetchVoucherBatches,
  type VoucherBatchStatsRow,
  type VoucherBatchStatus,
} from "@/lib/supabase/vouchers";
import { supabase } from "@/lib/supabase/client";
import {
  inferVoucherTier,
  voucherTierBadgeClass,
  voucherTierExportSlug,
  voucherTierLabel,
  type VoucherTier,
} from "@/lib/voucher-admin-labels";

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function isExpired(v: VoucherBatchStatsRow): boolean {
  if (!v.valid_until) return false;
  const t = new Date(v.valid_until).getTime();
  return Number.isFinite(t) && t < Date.now();
}

export function VouchersListPage() {
  const [rows, setRows] = useState<VoucherBatchStatsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | VoucherBatchStatus>("all");
  const [tierFilter, setTierFilter] = useState<"all" | VoucherTier>("all");
  const [expiredOnly, setExpiredOnly] = useState(false);
  const [purposeQuery, setPurposeQuery] = useState("");

  const filtered = useMemo(() => {
    const q = purposeQuery.trim().toLowerCase();
    return rows.filter((v) => {
      const tier = inferVoucherTier(v);
      if (tierFilter !== "all" && tier !== tierFilter) return false;
      if (statusFilter !== "all" && (v.status ?? "active") !== statusFilter) return false;
      if (expiredOnly && !isExpired(v)) return false;
      if (q) {
        const purpose = (v.campaign_purpose ?? "").toLowerCase();
        const attr = (v.attribution_source ?? "").toLowerCase();
        const name = v.name.toLowerCase();
        const code = (v.shared_code ?? "").toLowerCase();
        if (!purpose.includes(q) && !attr.includes(q) && !name.includes(q) && !code.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [rows, statusFilter, tierFilter, expiredOnly, purposeQuery]);

  const counts = useMemo(() => {
    let t1 = 0,
      t2 = 0,
      t3 = 0;
    for (const v of rows) {
      const t = inferVoucherTier(v);
      if (t === "t1") t1++;
      else if (t === "t3") t3++;
      else t2++;
    }
    return { t1, t2, t3, total: rows.length };
  }, [rows]);

  function exportCsv() {
    const cols = [
      "id",
      "name",
      "kind",
      "status",
      "batch_kind",
      "campaign_purpose",
      "attribution_source",
      "shared_code",
      "valid_until",
      "used_count",
      "total_codes",
    ];
    const esc = (x: string | number | null | undefined) => {
      const s = x == null ? "" : String(x);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [cols.join(",")];
    for (const v of filtered) {
      const tier = inferVoucherTier(v);
      lines.push(
        [
          esc(v.id),
          esc(v.name),
          esc(voucherTierExportSlug(tier)),
          esc(v.status ?? "active"),
          esc(v.batch_kind),
          esc(v.campaign_purpose),
          esc(v.attribution_source),
          esc(v.shared_code),
          esc(v.valid_until),
          esc(v.used_count),
          esc(v.total_codes),
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `voucher-batches-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Exported CSV.");
  }

  async function load() {
    if (!supabase) {
      toast.error(ADMIN_MSG_CATALOG_UNAVAILABLE);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await fetchVoucherBatches());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load vouchers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, []);

  return (
    <div className={ADMIN_LIST_PAGE_CLASS}>
      <PageHeader
        title="Vouchers"
        description="Shared promo = one code for everyone. Unique code batch = many codes or a pool. Customer-specific = one code for one shopper. Use Create to choose a format."
        actions={
          <Button type="button" size="sm" asChild>
            <Link to="/dashboard/vouchers/new">
              <Plus className="mr-2 h-4 w-4" />
              Create voucher
            </Link>
          </Button>
        }
      />

      {!loading && rows.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border bg-muted/40 px-2 py-1 font-medium text-foreground">{counts.total} batches</span>
          <span className="rounded-md border border-violet-200 bg-violet-50 px-2 py-1 dark:border-violet-800 dark:bg-violet-950/40">
            Shared {counts.t1}
          </span>
          <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 dark:border-sky-800 dark:bg-sky-950/40">
            Batch {counts.t2}
          </span>
          <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 dark:border-amber-800 dark:bg-amber-950/40">
            Dedicated {counts.t3}
          </span>
        </div>
      ) : null}

      <AdminListCard
        icon={TicketPercent}
        title="Campaigns"
        description="Filter by format, status, or search. Each row is one campaign (batch). Open Manage to edit rules and codes."
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Format</label>
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value as typeof tierFilter)}
              className="flex h-10 min-w-[140px] rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All formats</option>
              <option value="t1">Shared promo code</option>
              <option value="t2">Unique code batch</option>
              <option value="t3">Customer-specific code</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="flex h-10 min-w-[120px] rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-sm">
            <Checkbox checked={expiredOnly} onCheckedChange={(c) => setExpiredOnly(c === true)} />
            Expired only
          </label>
          <div className="min-w-[200px] flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Search</label>
            <input
              type="search"
              value={purposeQuery}
              onChange={(e) => setPurposeQuery(e.target.value)}
              placeholder="Name, shared code, purpose, attribution…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="default"
            className="h-10 shrink-0"
            disabled={loading || filtered.length === 0}
            onClick={exportCsv}
          >
            Export CSV
          </Button>
        </div>

        {loading ? (
          <AdminListSkeleton />
        ) : rows.length === 0 ? (
          <AdminListEmpty>No campaigns yet. Create a voucher and pick shared, batch, or customer-specific.</AdminListEmpty>
        ) : filtered.length === 0 ? (
          <AdminListEmpty>No campaigns match these filters.</AdminListEmpty>
        ) : (
          <TableContainer>
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className={ADMIN_TABLE_HEAD}>
                  <th className={adminTh()}>Campaign</th>
                  <th className={adminTh()}>Format</th>
                  <th className={adminTh()}>Status</th>
                  <th className={adminTh()}>Code / scale</th>
                  <th className={adminTh()}>Discount</th>
                  <th className={cn(adminTh(), "text-right tabular-nums")}>Stock</th>
                  <th className={cn(adminTh(), "text-right tabular-nums")}>Used</th>
                  <th className={adminTh()}>Valid until</th>
                  <th className={adminThEnd()} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => {
                  const tier = inferVoucherTier(v);
                  const vt = voucherTierLabel(tier);
                  const expired = isExpired(v);
                  return (
                    <tr key={v.id} className={cn(ADMIN_TABLE_ROW, expired && "opacity-70")}>
                      <td className={adminTd("max-w-[220px]")}>
                        <div className="font-medium leading-snug text-foreground">{v.name}</div>
                        {v.campaign_purpose?.trim() ? (
                          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{v.campaign_purpose}</div>
                        ) : null}
                      </td>
                      <td className={adminTd()}>
                        <Badge variant="outline" className={cn("font-normal", voucherTierBadgeClass(tier))}>
                          {vt.title}
                        </Badge>
                      </td>
                      <td className={adminTd()}>
                        <span className="capitalize text-muted-foreground">{v.status ?? "active"}</span>
                      </td>
                      <td className={adminTd("font-mono text-xs")}>
                        {v.batch_kind === "shared" ? (
                          <span className="text-foreground">{v.shared_code ?? "—"}</span>
                        ) : (
                          <span className="text-muted-foreground">
                            {v.total_codes} code{v.total_codes === 1 ? "" : "s"}
                            {v.code_prefix ? (
                              <span className="ml-1 text-[10px] uppercase text-muted-foreground/80">
                                · pref {v.code_prefix}
                              </span>
                            ) : null}
                          </span>
                        )}
                      </td>
                      <td className={adminTd("text-muted-foreground")}>
                        {v.batch_kind === "multi" && (v.discount_type == null || v.voucher_amount == null)
                          ? "Per code"
                          : v.discount_type === "percentage"
                            ? `${v.voucher_amount}%`
                            : `${Number(v.voucher_amount ?? 0).toFixed(0)} PKR`}
                      </td>
                      <td className={adminTd("text-right tabular-nums text-emerald-700 dark:text-emerald-400")}>
                        {v.available_count == null ? "—" : v.available_count}
                      </td>
                      <td className={adminTd("text-right tabular-nums")}>{v.used_count}</td>
                      <td className={adminTd()}>
                        {v.valid_until ? (
                          <span
                            className={cn(
                              "tabular-nums",
                              expired ? "font-medium text-destructive" : "text-muted-foreground",
                            )}
                          >
                            {fmtDate(v.valid_until)}
                            {expired ? " · ended" : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={adminTd("text-right")}>
                        <Link
                          className="inline-flex rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                          to={`/dashboard/vouchers/${v.id}`}
                        >
                          Manage
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableContainer>
        )}
      </AdminListCard>
    </div>
  );
}
