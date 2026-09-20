import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { ReviewComposeAdminDialog } from "@/components/dashboard/review-compose-admin-dialog";
import { ReviewCsvImportDialog } from "@/components/dashboard/review-csv-import-dialog";
import { toast } from "sonner";
import { ADMIN_MSG_CATALOG_UNAVAILABLE } from "@/lib/admin-user-messages";
import {
  AdminListCard,
  AdminListSkeleton,
  AdminListEmpty,
  AdminFilterBar,
  ADMIN_LIST_PAGE_CLASS,
  TableContainer,
  ADMIN_TABLE_HEAD,
  ADMIN_TABLE_ROW,
  adminTh,
  adminThEnd,
  adminTd,
} from "@/components/dashboard/admin-list-shell";
import { AdminPagination } from "@/components/dashboard/admin-pagination";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { AdminStandardDialogContent } from "@/components/ui/admin-standard-dialog";
import {
  fetchReviewsAdmin,
  countReviewsAdmin,
  countReviewsByStatusAdmin,
  updateReviewStatusAdmin,
  deleteReviewAdmin,
  parseReviewMediaItems,
  type ReviewAdminRow,
  type ReviewModerationStatus,
} from "@/lib/supabase/reviews-admin";
import { revalidateStorefrontAfterReviewsChange } from "@/lib/revalidate-after-reviews";
import { requestReviewThankYouVoucher } from "@/lib/review-thank-you-voucher";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const TABS: Array<{ value: ReviewModerationStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const STAR_LEVELS = [1, 2, 3, 4, 5] as const;
const PAGE_SIZE = 50;

export function ReviewsListPage() {
  const [rows, setRows] = useState<ReviewAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ReviewModerationStatus | "all">("all");
  /** Which star ratings to include in the list (multi-select). At least one must stay on. */
  const [ratingFilter, setRatingFilter] = useState<number[]>(() => [...STAR_LEVELS]);
  const [page, setPage] = useState(1);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [statusCounts, setStatusCounts] = useState<
    Record<ReviewModerationStatus | "all", number>
  >({ all: 0, pending: 0, approved: 0, rejected: 0 });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) {
      toast.error(ADMIN_MSG_CATALOG_UNAVAILABLE);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const ratings = ratingFilter.length > 0 ? ratingFilter : [...STAR_LEVELS];
      const [data, filteredTotal, byStatus] = await Promise.all([
        fetchReviewsAdmin({
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
          status: filter,
          ratings,
        }),
        countReviewsAdmin({ status: filter, ratings }),
        countReviewsByStatusAdmin(),
      ]);
      setRows(data);
      setTotalFiltered(filteredTotal);
      setStatusCounts(byStatus);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load reviews.");
    } finally {
      setLoading(false);
    }
  }, [filter, ratingFilter, page]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [filter, ratingFilter]);

  function toggleRatingStar(n: number) {
    setRatingFilter((prev) => {
      if (prev.includes(n)) {
        if (prev.length <= 1) {
          toast.info("Keep at least one star level selected.");
          return prev;
        }
        return prev.filter((x) => x !== n);
      }
      return [...prev, n].sort((a, b) => a - b);
    });
  }

  function selectAllRatings() {
    setRatingFilter([...STAR_LEVELS]);
  }

  async function setStatus(id: string, status: ReviewModerationStatus) {
    setBusyId(id);
    const res = await updateReviewStatusAdmin(id, status);
    setBusyId(null);
    if (!res.ok) {
      toast.error(res.error ?? "Update failed.");
      return;
    }
    revalidateStorefrontAfterReviewsChange();
    if (status === "approved") {
      requestReviewThankYouVoucher(id);
    }
    await load();
  }

  async function confirmDelete() {
    if (!deleteId) return;
    setBusyId(deleteId);
    const res = await deleteReviewAdmin(deleteId);
    setBusyId(null);
    setDeleteId(null);
    if (!res.ok) {
      toast.error(res.error ?? "Delete failed.");
      return;
    }
    toast.success("Review deleted.");
    revalidateStorefrontAfterReviewsChange();
    await load();
  }

  const filterBar = (
    <div className="flex w-full flex-col gap-3">
      <AdminFilterBar>
        {TABS.map((t) => (
          <Button
            key={t.value}
            type="button"
            size="sm"
            variant={filter === t.value ? "default" : "ghost"}
            className={cn(
              "rounded-lg",
              filter === t.value ? "shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setFilter(t.value)}
          >
            {t.label}
            <span className="ml-1.5 tabular-nums opacity-80">
              ({statusCounts[t.value].toLocaleString("en-US")})
            </span>
          </Button>
        ))}
      </AdminFilterBar>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Star ratings
        </span>
        {STAR_LEVELS.map((n) => (
          <Button
            key={n}
            type="button"
            size="sm"
            variant={ratingFilter.includes(n) ? "secondary" : "outline"}
            className={cn(
              "h-8 min-w-9 rounded-lg px-2 tabular-nums",
              ratingFilter.includes(n) ? "shadow-sm" : "text-muted-foreground",
            )}
            onClick={() => toggleRatingStar(n)}
            title={
              ratingFilter.includes(n)
                ? `Hide ${n}-star reviews (click again)`
                : `Show ${n}-star reviews`
            }
          >
            {n}★
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground"
          onClick={selectAllRatings}
        >
          All stars
        </Button>
      </div>
    </div>
  );

  return (
    <div className={ADMIN_LIST_PAGE_CLASS}>
      <PageHeader
        title="Reviews"
        description={`Moderate storefront reviews (${statusCounts.all.toLocaleString("en-US")} total). Approved reviews show as Verified buyer on the PDP.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setCsvImportOpen(true)}>
              Import CSV
            </Button>
            <Button type="button" size="sm" onClick={() => setComposeOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add review as customer
            </Button>
          </div>
        }
      />

      <ReviewComposeAdminDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        onCreated={() => void load()}
      />

      <ReviewCsvImportDialog
        open={csvImportOpen}
        onOpenChange={setCsvImportOpen}
        onImported={() => void load()}
      />

      <Dialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AdminStandardDialogContent
          title="Delete this review?"
          subtitle="This removes the review permanently and updates the product's rating and review count. This cannot be undone."
          footer={
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setDeleteId(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busyId !== null}
                onClick={() => void confirmDelete()}
              >
                Delete
              </Button>
            </DialogFooter>
          }
        />
      </Dialog>

      <AdminListCard
        title="Moderation queue"
        description={`${totalFiltered.toLocaleString("en-US")} reviews in this filter · page ${page}`}
        headerRight={filterBar}
      >
        {loading ? (
          <AdminListSkeleton />
        ) : rows.length === 0 ? (
          <AdminListEmpty>No reviews in this filter.</AdminListEmpty>
        ) : (
          <>
          <TableContainer>
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead>
                <tr className={ADMIN_TABLE_HEAD}>
                  <th className={adminTh()}>Product</th>
                  <th className={adminTh()}>Reviewer</th>
                  <th className={adminTh()}>Rating</th>
                  <th className={adminTh()}>Media</th>
                  <th className={adminTh()}>Title</th>
                  <th className={adminTh()}>Status</th>
                  <th className={adminTh()}>Submitted</th>
                  <th className={adminThEnd()}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={ADMIN_TABLE_ROW}>
                    <td className={adminTd("max-w-[180px] truncate")} title={r.product_name ?? undefined}>
                      {r.product_name ?? "—"}
                    </td>
                    <td className={adminTd("max-w-[160px] truncate")} title={r.reviewer_label ?? undefined}>
                      {r.reviewer_label ?? "—"}
                    </td>
                    <td className={adminTd("tabular-nums")}>{r.rating} / 5</td>
                    <td className={adminTd("w-[100px]")}>
                      {(() => {
                        const items = parseReviewMediaItems(r.media);
                        if (items.length === 0) {
                          return <span className="text-muted-foreground">—</span>;
                        }
                        const first = items[0]!;
                        return (
                          <div className="flex items-center gap-2">
                            {first.kind === "image" ? (
                              <img
                                src={first.url}
                                alt=""
                                className="h-10 w-10 rounded border border-border object-cover"
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground" title={first.url}>
                                Video
                              </span>
                            )}
                            {items.length > 1 ? (
                              <span className="text-xs text-muted-foreground">+{items.length - 1}</span>
                            ) : null}
                          </div>
                        );
                      })()}
                    </td>
                    <td className={adminTd("max-w-[220px] truncate")}>{r.title || r.body.slice(0, 48)}</td>
                    <td className={adminTd()}>
                      <Badge
                        variant={
                          r.status === "approved"
                            ? "success"
                            : r.status === "rejected"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className={adminTd("text-xs text-muted-foreground")}>
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className={adminTd()}>
                      <div className="flex flex-wrap gap-1">
                        {r.status !== "approved" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busyId === r.id}
                            onClick={() => void setStatus(r.id, "approved")}
                          >
                            Approve
                          </Button>
                        ) : null}
                        {r.status !== "rejected" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busyId === r.id}
                            onClick={() => void setStatus(r.id, "rejected")}
                          >
                            Reject
                          </Button>
                        ) : null}
                        {r.status !== "pending" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busyId === r.id}
                            onClick={() => void setStatus(r.id, "pending")}
                          >
                            Pending
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={busyId === r.id}
                          onClick={() => setDeleteId(r.id)}
                          title="Delete review"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableContainer>
          <AdminPagination
            page={page}
            pageSize={PAGE_SIZE}
            total={totalFiltered}
            onPageChange={setPage}
            className="mt-4"
          />
          </>
        )}
      </AdminListCard>
    </div>
  );
}
